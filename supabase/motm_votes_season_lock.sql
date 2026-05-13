-- Blocks MOTM inserts/updates for dummy preview season 2627 (keep in sync with
-- SEASON_SLUGS_PREVIEW_LOCKED in src/seasons.js).
-- Run after motm_votes.sql.

drop policy if exists "motm_votes_public_insert" on motm_votes;
create policy "motm_votes_public_insert"
on motm_votes for insert
with check (
  exists (
    select 1 from games g
    where g.id = game_id
      and coalesce(g.season_slug, '') <> '2627'
  )
);

drop policy if exists "motm_votes_public_update" on motm_votes;
create policy "motm_votes_public_update"
on motm_votes for update
using (
  exists (
    select 1 from games g
    where g.id = motm_votes.game_id
      and coalesce(g.season_slug, '') <> '2627'
  )
)
with check (
  exists (
    select 1 from games g
    where g.id = motm_votes.game_id
      and coalesce(g.season_slug, '') <> '2627'
  )
);
