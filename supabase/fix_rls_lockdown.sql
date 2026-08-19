-- ============================================================================
-- SECURITY FIX — close anon write access to games / players / attendance /
-- player_stats.  Run this in the Supabase SQL editor BEFORE sharing the app.
-- ============================================================================
--
-- WHAT WAS WRONG
-- Probing the live API with the public anon key (the one compiled into the
-- client bundle, so effectively "anyone on the internet") showed these all
-- SUCCEEDING:
--     insert into players ...                     -> 201, row landed
--     update players set is_admin = true ...      -> 204, flag actually set
--     update games set home_score = 99 ...        -> 204, score actually changed
--     insert into attendance / player_stats ...   -> 201, rows landed
-- Setting players.is_admin (or players.auth_user_id) from anon is full admin
-- takeover: point an existing player row at your own auth uid, flip the flag,
-- and you are an admin of the app.
--
-- WHY THE EARLIER MIGRATIONS DID NOT PREVENT IT
-- auth_ownership.sql removes the loose policies with "drop policy if exists"
-- naming each one EXACTLY ("attendance_public_insert", ...). Policies created
-- by hand in the Supabase dashboard get default names ("Enable insert for all
-- users", ...), so those targeted drops never matched them and they survived.
-- PostgreSQL ORs permissive policies together, so one loose policy alongside a
-- strict one means the loose one decides. That is why guest_players and
-- motm_votes were locked down correctly while these four were wide open.
--
-- THE FIX
-- Stop dropping by name. Enumerate every policy actually attached to these
-- tables, drop them all, then recreate exactly the intended set. That is
-- immune to whatever a policy happens to be called.
--
-- SAFE FOR THE SYNC JOBS: sync-lzv, sync-palmares and weekly-digest all use
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS entirely. gen-ics uses the
-- anon key but only reads. Nothing legitimate needs anon writes.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Drop EVERY policy on the affected tables, whatever it is called.
-- ---------------------------------------------------------------------------
do $do$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('games', 'players', 'attendance', 'player_stats',
                         'guest_players', 'motm_votes', 'opponent_strength',
                         'player_claims')
  loop
    raise notice 'dropping policy % on %.%', r.policyname, r.schemaname, r.tablename;
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- 2. RLS on for all of them (a table with RLS off ignores policies entirely).
-- ---------------------------------------------------------------------------
alter table games             enable row level security;
alter table players           enable row level security;
alter table attendance        enable row level security;
alter table player_stats      enable row level security;
alter table guest_players     enable row level security;
alter table motm_votes        enable row level security;
alter table opponent_strength enable row level security;
alter table player_claims     enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Recreate the intended policies. Reads stay public; writes are scoped.
--    Same intent as auth_ownership.sql / auth_claims.sql / opponent_strength.sql,
--    which remain the canonical description of the model.
-- ---------------------------------------------------------------------------

-- games: public read, admin write
create policy "games_public_read" on games for select using (true);
create policy "games_admin_write" on games for all
  using (is_admin_user()) with check (is_admin_user());

-- players: public read, admin write (is_admin / auth_user_id are admin-only)
create policy "players_public_read" on players for select using (true);
create policy "players_admin_write" on players for all
  using (is_admin_user()) with check (is_admin_user());

-- attendance: public read, own row or admin
create policy "attendance_public_read" on attendance for select using (true);
create policy "attendance_owner_write" on attendance for all
  using      (is_admin_user() or (auth.uid() is not null and player_id = current_player_id()))
  with check (is_admin_user() or (auth.uid() is not null and player_id = current_player_id()));

-- player_stats: public read, own row or admin
create policy "player_stats_public_read" on player_stats for select using (true);
create policy "player_stats_owner_write" on player_stats for all
  using      (is_admin_user() or (auth.uid() is not null and player_id = current_player_id()))
  with check (is_admin_user() or (auth.uid() is not null and player_id = current_player_id()));

-- guest_players: public read, admin write
create policy "guest_players_public_read" on guest_players for select using (true);
create policy "guest_players_admin_write" on guest_players for all
  using (is_admin_user()) with check (is_admin_user());

-- motm_votes: public read, one row per signed-in user (unique (game_id, voter_key))
create policy "motm_votes_public_read" on motm_votes for select using (true);
create policy "motm_votes_user_write" on motm_votes for all
  using      (is_admin_user() or (auth.uid() is not null and voter_key = auth.uid()::text))
  with check (is_admin_user() or (auth.uid() is not null and voter_key = auth.uid()::text));

-- opponent_strength: public read, service-role write (the palmares job)
create policy "opponent_strength_public_read" on opponent_strength for select using (true);
create policy "opponent_strength_admin_write" on opponent_strength for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- player_claims: own rows or admin
create policy "player_claims_read" on player_claims for select
  using (is_admin_user() or user_id = auth.uid());

create policy "player_claims_insert" on player_claims for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and status = 'pending'
    and not exists (select 1 from players where auth_user_id = auth.uid())
    and not exists (select 1 from players p where p.id = player_id and p.auth_user_id is not null)
  );

create policy "player_claims_update" on player_claims for update
  using      (is_admin_user() or (user_id = auth.uid() and status = 'pending'))
  with check (is_admin_user() or (user_id = auth.uid() and status in ('pending', 'cancelled')));

create policy "player_claims_delete" on player_claims for delete
  using (is_admin_user());

-- ---------------------------------------------------------------------------
-- 4. Defence in depth: approving a claim must never steal an existing link.
--    A user can edit their own pending claim, so they could repoint it at a
--    player that is already linked and hope an admin approves it. Refuse that
--    in the function too, so an admin misclick cannot do it either.
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_claim(claim_id uuid, promote_admin boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c        player_claims%rowtype;
  existing uuid;
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;

  select * into c from player_claims where id = claim_id for update;
  if not found or c.status <> 'pending' then
    raise exception 'Claim not found or already decided';
  end if;

  select auth_user_id into existing from players where id = c.player_id;
  if existing is not null and existing <> c.user_id then
    raise exception 'Player % is already linked to another account', c.player_id;
  end if;

  if exists (select 1 from players where auth_user_id = c.user_id and id <> c.player_id) then
    raise exception 'That account is already linked to a different player';
  end if;

  update players
     set auth_user_id = c.user_id,
         is_admin     = case when promote_admin then true else is_admin end
   where id = c.player_id;

  update player_claims
     set status = 'approved', decided_at = now(), decided_by = auth.uid()
   where id = claim_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Remove the rows the security probe created (player 'zz' + its children).
-- ---------------------------------------------------------------------------
delete from attendance   where player_id = 'zz';
delete from player_stats where player_id = 'zz';
delete from players      where id = 'zz';

commit;

-- ---------------------------------------------------------------------------
-- Verification. Expect no 'zz' anywhere, exactly one admin (Matthias), no
-- 26-27 scores yet, and each table listing only the policies created above
-- (2 each, except player_claims which has 4).
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('games','players','attendance','player_stats','guest_players',
                     'motm_votes','opponent_strength','player_claims')
 order by tablename, policyname;

-- The helper functions the new policies depend on MUST exist. Until now the
-- loose policies were masking `attendance_owner_write` / `player_stats_owner_write`,
-- so current_player_id() has effectively never been exercised in production.
-- Expect two rows: current_player_id and is_admin_user.
select proname, prosecdef as security_definer
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('current_player_id', 'is_admin_user')
 order by proname;

select
  (select count(*) from players      where id        = 'zz') as junk_players,
  (select count(*) from attendance   where player_id = 'zz') as junk_attendance,
  (select count(*) from player_stats where player_id = 'zz') as junk_stats,
  (select count(*) from players      where is_admin)         as admins,
  (select count(*) from games where season_slug = '2627' and home_score is not null) as scored_2627;

-- ---------------------------------------------------------------------------
-- AFTER RUNNING THIS, SMOKE-TEST IN THE APP (2 minutes, do it before sharing):
--   1. Signed OUT, the fixtures still load  -> public read still works.
--   2. Signed in as yourself, set an RSVP on the next fixture and reload
--      -> it persists. This is the important one: it is the first time
--         attendance_owner_write / current_player_id() actually decide a write.
--   3. As admin, set a final score on any game -> saves (that write already
--      verifies itself with .select(), so a silent RLS block surfaces as a toast).
--   4. Re-run the anon probe from the review; every write must now fail.
-- ---------------------------------------------------------------------------
