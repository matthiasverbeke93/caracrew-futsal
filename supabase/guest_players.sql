create table if not exists guest_players (
  id text primary key,
  game_id text not null references games(id) on delete cascade,
  source_player_id text references players(id) on delete set null,
  name text not null,
  status text not null default 'playing' check (
    status in ('playing', 'cant', 'if_needed')
  ),
  goals int not null default 0,
  assists int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table guest_players
add column if not exists source_player_id text references players(id) on delete set null;

alter table guest_players enable row level security;

drop policy if exists "guest_players_public_read" on guest_players;
create policy "guest_players_public_read"
on guest_players for select
using (true);

-- Write policies live in hardening_2026_09.sql (supersedes fix_rls_lockdown.sql). The original
-- `using (true)` insert/update/delete policies that used to follow here reopened anonymous writes
-- whenever this file was re-run (the 2026-08-19 incident class) and have been removed. Drop them
-- defensively in case an old copy was ever applied:
drop policy if exists "guest_players_public_insert" on guest_players;
drop policy if exists "guest_players_public_update" on guest_players;
drop policy if exists "guest_players_public_delete" on guest_players;
