create table if not exists opponent_strength (
  season_slug text not null default '2526',
  team_id text not null,
  name text not null,
  last_synced timestamptz not null default now(),
  current_position int,
  current_ptn_per_match numeric(4, 2),
  history jsonb not null default '[]'::jsonb,
  strength_score numeric(6, 2),
  primary key (season_slug, team_id)
);

alter table opponent_strength enable row level security;

drop policy if exists "opponent_strength_public_read" on opponent_strength;
create policy "opponent_strength_public_read"
on opponent_strength for select
using (true);

drop policy if exists "opponent_strength_admin_write" on opponent_strength;
create policy "opponent_strength_admin_write"
on opponent_strength for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
