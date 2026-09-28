-- Database hardening from the 2026-09-28 review. Idempotent, safe to re-run.
--
-- Nothing here changes who may do what today: every policy keeps its exact predicate. It
--   1. revokes the default PUBLIC/anon EXECUTE on the admin_* RPCs (advisor 0028; they self-gate
--      on is_admin_user(), so this is defence in depth against a future function forgetting to);
--   2. revokes TRUNCATE / TRIGGER / REFERENCES from the API roles (TRUNCATE ignores RLS);
--   3. indexes the seven unindexed foreign keys (advisor 0001);
--   4. adds non-negative CHECKs on goals / assists / scores (all live rows already pass);
--   5. rewrites the write policies as per-command policies with auth calls wrapped in
--      `(select …)` — same predicates, evaluated once per statement instead of per row
--      (advisors 0003 / 0006), and scoped `to authenticated` where anon can never pass anyway;
--   6. ties bug_reports.reporter_player_id to the caller's own player (it was free text for anon);
--   7. guards admin_set_admin_flag (cannot remove the last admin) and admin_link_player
--      (refuses to overwrite a link or double-link an account; raises on unknown id).
--
-- Supersedes the policy / grant / admin_* definitions in fix_rls_lockdown.sql, bug_reports.sql
-- and auth_claims.sql; each now carries a banner to re-run this file after it.

begin;

-- 1. RPC execute grants --------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- 2. Table privileges the API never needs ---------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- 3. Foreign-key indexes --------------------------------------------------------------------
create index if not exists attendance_player_id_idx            on attendance (player_id);
create index if not exists player_stats_player_id_idx          on player_stats (player_id);
create index if not exists guest_players_game_id_idx           on guest_players (game_id);
create index if not exists guest_players_source_player_id_idx  on guest_players (source_player_id);
create index if not exists bug_reports_auth_user_id_idx        on bug_reports (auth_user_id);
create index if not exists bug_reports_reporter_player_id_idx  on bug_reports (reporter_player_id);
create index if not exists player_claims_decided_by_idx        on player_claims (decided_by);

-- 4. Sanity CHECKs --------------------------------------------------------------------------
alter table player_stats  drop constraint if exists player_stats_nonneg_chk;
alter table player_stats  add  constraint player_stats_nonneg_chk
  check (coalesce(goals, 0) >= 0 and coalesce(assists, 0) >= 0);
alter table guest_players drop constraint if exists guest_players_nonneg_chk;
alter table guest_players add  constraint guest_players_nonneg_chk
  check (goals >= 0 and assists >= 0);
alter table games         drop constraint if exists games_score_nonneg_chk;
alter table games         add  constraint games_score_nonneg_chk
  check (coalesce(home_score, 0) >= 0 and coalesce(away_score, 0) >= 0);

-- 5. Write policies: per command, auth calls hoisted ----------------------------------------
-- Owner-or-admin tables (attendance, player_stats).
drop policy if exists attendance_owner_write  on attendance;
drop policy if exists attendance_owner_insert on attendance;
drop policy if exists attendance_owner_update on attendance;
drop policy if exists attendance_owner_delete on attendance;
create policy attendance_owner_insert on attendance for insert to authenticated
  with check ((select is_admin_user()) or player_id = (select current_player_id()));
create policy attendance_owner_update on attendance for update to authenticated
  using      ((select is_admin_user()) or player_id = (select current_player_id()))
  with check ((select is_admin_user()) or player_id = (select current_player_id()));
create policy attendance_owner_delete on attendance for delete to authenticated
  using      ((select is_admin_user()) or player_id = (select current_player_id()));

drop policy if exists player_stats_owner_write  on player_stats;
drop policy if exists player_stats_owner_insert on player_stats;
drop policy if exists player_stats_owner_update on player_stats;
drop policy if exists player_stats_owner_delete on player_stats;
create policy player_stats_owner_insert on player_stats for insert to authenticated
  with check ((select is_admin_user()) or player_id = (select current_player_id()));
create policy player_stats_owner_update on player_stats for update to authenticated
  using      ((select is_admin_user()) or player_id = (select current_player_id()))
  with check ((select is_admin_user()) or player_id = (select current_player_id()));
create policy player_stats_owner_delete on player_stats for delete to authenticated
  using      ((select is_admin_user()) or player_id = (select current_player_id()));

-- MOTM: one row per signed-in voter (voter_key = auth uid), admins may correct.
drop policy if exists motm_votes_user_write  on motm_votes;
drop policy if exists motm_votes_user_insert on motm_votes;
drop policy if exists motm_votes_user_update on motm_votes;
drop policy if exists motm_votes_user_delete on motm_votes;
create policy motm_votes_user_insert on motm_votes for insert to authenticated
  with check ((select is_admin_user()) or voter_key = (select auth.uid())::text);
create policy motm_votes_user_update on motm_votes for update to authenticated
  using      ((select is_admin_user()) or voter_key = (select auth.uid())::text)
  with check ((select is_admin_user()) or voter_key = (select auth.uid())::text);
create policy motm_votes_user_delete on motm_votes for delete to authenticated
  using      ((select is_admin_user()) or voter_key = (select auth.uid())::text);

-- Admin-only tables (games, players, guest_players).
do $$
declare t text;
begin
  foreach t in array array['games', 'players', 'guest_players'] loop
    execute format('drop policy if exists %I on %I', t || '_admin_write',  t);
    execute format('drop policy if exists %I on %I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on %I', t || '_admin_update', t);
    execute format('drop policy if exists %I on %I', t || '_admin_delete', t);
    execute format('create policy %I on %I for insert to authenticated with check ((select is_admin_user()))', t || '_admin_insert', t);
    execute format('create policy %I on %I for update to authenticated using ((select is_admin_user())) with check ((select is_admin_user()))', t || '_admin_update', t);
    execute format('create policy %I on %I for delete to authenticated using ((select is_admin_user()))', t || '_admin_delete', t);
  end loop;
end $$;

-- opponent_strength is written only by the palmares sync (service role, which bypasses RLS).
-- The old `auth.role() = 'service_role'` ALL policy could never match anyone else; keep an
-- explicit, cheap equivalent so intent stays documented.
drop policy if exists opponent_strength_admin_write   on opponent_strength;
drop policy if exists opponent_strength_service_write on opponent_strength;
create policy opponent_strength_service_write on opponent_strength for all to service_role
  using (true) with check (true);

-- player_claims: same predicates, auth.uid() hoisted.
drop policy if exists player_claims_read on player_claims;
create policy player_claims_read on player_claims for select
  using ((select is_admin_user()) or user_id = (select auth.uid()));

drop policy if exists player_claims_insert on player_claims;
create policy player_claims_insert on player_claims for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and not exists (select 1 from players where players.auth_user_id = (select auth.uid()))
    and not exists (select 1 from players p where p.id = player_claims.player_id and p.auth_user_id is not null)
  );

drop policy if exists player_claims_update on player_claims;
create policy player_claims_update on player_claims for update to authenticated
  using      ((select is_admin_user()) or (user_id = (select auth.uid()) and status = 'pending'))
  with check ((select is_admin_user()) or (user_id = (select auth.uid()) and status in ('pending', 'cancelled')));

-- 6. Bug reports: attribution pinned to the caller -----------------------------------------
drop policy if exists bug_reports_public_insert on bug_reports;
create policy bug_reports_public_insert on bug_reports for insert
  with check (
    emailed_at is null and email_error is null and resolved_at is null and email_attempts = 0
    and (auth_user_id is null or auth_user_id = (select auth.uid()))
    and (reporter_player_id is null or reporter_player_id = (select current_player_id()))
  );

-- 7. Admin RPC guards -----------------------------------------------------------------------
create or replace function public.admin_set_admin_flag(player_id_arg text, make_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  if not make_admin
     and exists (select 1 from players where id = player_id_arg and is_admin)
     and (select count(*) from players where is_admin) <= 1 then
    raise exception 'Cannot remove the last admin';
  end if;
  update players set is_admin = make_admin where id = player_id_arg;
  if not found then
    raise exception 'Player % not found', player_id_arg;
  end if;
end;
$fn$;

create or replace function public.admin_link_player(player_id_arg text, user_id_arg uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare existing uuid;
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  select auth_user_id into existing from players where id = player_id_arg for update;
  if not found then
    raise exception 'Player % not found', player_id_arg;
  end if;
  if existing is not null and existing <> user_id_arg then
    raise exception 'Player % is already linked to another account — unlink first', player_id_arg;
  end if;
  if exists (select 1 from players where auth_user_id = user_id_arg and id <> player_id_arg) then
    raise exception 'That account is already linked to a different player';
  end if;
  update players set auth_user_id = user_id_arg where id = player_id_arg;
end;
$fn$;

-- create or replace keeps existing grants, but re-apply the revoke for these two explicitly.
revoke execute on function public.admin_set_admin_flag(text, boolean) from public, anon;
revoke execute on function public.admin_link_player(text, uuid)       from public, anon;
grant  execute on function public.admin_set_admin_flag(text, boolean) to authenticated;
grant  execute on function public.admin_link_player(text, uuid)       to authenticated;

commit;

-- Verification: policies per table, and no admin_* function executable by anon.
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by 1, 2;
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'admin\_%' order by 1;
