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

drop policy if exists "motm_votes_public_insert" on motm_votes;
create policy "motm_votes_public_insert"
on motm_votes for insert
with check (true);

drop policy if exists "motm_votes_public_update" on motm_votes;
create policy "motm_votes_public_update"
on motm_votes for update
using (true)
with check (true);

drop policy if exists "motm_votes_public_delete" on motm_votes;
create policy "motm_votes_public_delete"
on motm_votes for delete
using (true);
