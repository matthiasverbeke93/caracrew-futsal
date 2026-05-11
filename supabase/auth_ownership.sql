-- Auth ownership: each Supabase auth user can be linked to one player.
-- Reads stay public. Writes require login AND (own row OR is_admin).
-- Game-level writes (games, opponent_strength) are admin-only.
-- MOTM votes: any signed-in user can vote (one row per user per game).
--
-- After a player signs up via the app, run:
--   update players
--      set auth_user_id = '<auth.uid>'
--    where lower(name) = lower('<player full name>');
--
-- To promote yourself to admin:
--   update players set is_admin = true where lower(name) = lower('matthias verbeke');

-- ---------------------------------------------------------------------------
-- 1. players: link to auth, admin flag
-- ---------------------------------------------------------------------------
alter table players
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

alter table players
  add column if not exists is_admin boolean not null default false;

create unique index if not exists players_auth_user_id_unique
  on players (auth_user_id)
  where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. helper functions (SECURITY DEFINER so policies can use them)
-- ---------------------------------------------------------------------------
create or replace function public.current_player_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id from players where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from players where auth_user_id = auth.uid() limit 1),
    false
  );
$$;

grant execute on function public.current_player_id() to anon, authenticated;
grant execute on function public.is_admin_user()    to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. players: read public, self-update own non-privileged fields, admin all
-- ---------------------------------------------------------------------------
alter table players enable row level security;

drop policy if exists "players_public_read" on players;
create policy "players_public_read"
on players for select
using (true);

drop policy if exists "players_admin_write" on players;
create policy "players_admin_write"
on players for all
using (is_admin_user())
with check (is_admin_user());

-- ---------------------------------------------------------------------------
-- 4. attendance: own row or admin
-- ---------------------------------------------------------------------------
alter table attendance enable row level security;

drop policy if exists "attendance_public_read"  on attendance;
drop policy if exists "attendance_public_insert" on attendance;
drop policy if exists "attendance_public_update" on attendance;
drop policy if exists "attendance_public_delete" on attendance;
drop policy if exists "attendance_owner_write" on attendance;

create policy "attendance_public_read"
on attendance for select
using (true);

create policy "attendance_owner_write"
on attendance for all
using (
  is_admin_user()
  or (auth.uid() is not null and player_id = current_player_id())
)
with check (
  is_admin_user()
  or (auth.uid() is not null and player_id = current_player_id())
);

-- ---------------------------------------------------------------------------
-- 5. player_stats: own row or admin
-- ---------------------------------------------------------------------------
alter table player_stats enable row level security;

drop policy if exists "player_stats_public_read"  on player_stats;
drop policy if exists "player_stats_public_insert" on player_stats;
drop policy if exists "player_stats_public_update" on player_stats;
drop policy if exists "player_stats_public_delete" on player_stats;
drop policy if exists "player_stats_owner_write" on player_stats;

create policy "player_stats_public_read"
on player_stats for select
using (true);

create policy "player_stats_owner_write"
on player_stats for all
using (
  is_admin_user()
  or (auth.uid() is not null and player_id = current_player_id())
)
with check (
  is_admin_user()
  or (auth.uid() is not null and player_id = current_player_id())
);

-- ---------------------------------------------------------------------------
-- 6. guest_players: admin-only writes (ad-hoc guests are an admin action)
-- ---------------------------------------------------------------------------
alter table guest_players enable row level security;

drop policy if exists "guest_players_public_read"  on guest_players;
drop policy if exists "guest_players_public_insert" on guest_players;
drop policy if exists "guest_players_public_update" on guest_players;
drop policy if exists "guest_players_public_delete" on guest_players;
drop policy if exists "guest_players_admin_write" on guest_players;

create policy "guest_players_public_read"
on guest_players for select
using (true);

create policy "guest_players_admin_write"
on guest_players for all
using (is_admin_user())
with check (is_admin_user());

-- ---------------------------------------------------------------------------
-- 7. motm_votes: any signed-in user votes; one row per (game, user)
-- ---------------------------------------------------------------------------
alter table motm_votes enable row level security;

drop policy if exists "motm_votes_public_read"   on motm_votes;
drop policy if exists "motm_votes_public_insert" on motm_votes;
drop policy if exists "motm_votes_public_update" on motm_votes;
drop policy if exists "motm_votes_public_delete" on motm_votes;
drop policy if exists "motm_votes_user_write"    on motm_votes;

create policy "motm_votes_public_read"
on motm_votes for select
using (true);

create policy "motm_votes_user_write"
on motm_votes for all
using (
  is_admin_user()
  or (auth.uid() is not null and voter_key = auth.uid()::text)
)
with check (
  is_admin_user()
  or (auth.uid() is not null and voter_key = auth.uid()::text)
);

-- ---------------------------------------------------------------------------
-- 8. games: admin-only writes
-- ---------------------------------------------------------------------------
alter table games enable row level security;

drop policy if exists "games_public_read"  on games;
drop policy if exists "games_admin_write" on games;

create policy "games_public_read"
on games for select
using (true);

create policy "games_admin_write"
on games for all
using (is_admin_user())
with check (is_admin_user());
