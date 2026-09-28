create table if not exists motm_votes (
  id text primary key,
  game_id text not null references games(id) on delete cascade,
  nominee_id text not null,
  voter_key text not null,
  created_at timestamptz not null default now(),
  unique (game_id, voter_key)
);

alter table motm_votes enable row level security;

drop policy if exists "motm_votes_public_read" on motm_votes;
create policy "motm_votes_public_read"
on motm_votes for select
using (true);

-- Write policies live in hardening_2026_09.sql (supersedes fix_rls_lockdown.sql). The original
-- `using (true)` insert/update/delete policies that used to follow here reopened anonymous writes
-- whenever this file was re-run (the 2026-08-19 incident class) and have been removed. Drop them
-- defensively in case an old copy was ever applied:
drop policy if exists "motm_votes_public_insert" on motm_votes;
drop policy if exists "motm_votes_public_update" on motm_votes;
drop policy if exists "motm_votes_public_delete" on motm_votes;
