-- Add the rest of the LZV standings row to opponent_strength, so the stats-page
-- league table can show W / D / L, goals for / against and points, not just
-- points per match.
--
-- `scripts/sync-palmares.mjs` already parses every column of the standings
-- table; until now it persisted only position, pts/match and played. Goal
-- difference is derived in the app (gf - ga), so it is not stored.
--
-- Idempotent, safe to re-run. Rows show NULL until the next palmares sync
-- (daily cron, or `npm run sync:palmares`). The sync falls back to the old
-- columns if this migration has not been run, so it never stops working.

alter table opponent_strength
  add column if not exists current_wins   integer,
  add column if not exists current_draws  integer,
  add column if not exists current_losses integer,
  add column if not exists current_gf     integer,
  add column if not exists current_ga     integer,
  add column if not exists current_points integer;

-- Verification: expect the columns to exist; after the next sync, the current
-- season's rows carry numbers.
select season_slug,
       count(*)                                          as rows,
       count(*) filter (where current_points is not null) as with_full_row
  from opponent_strength
 group by season_slug
 order by season_slug;
