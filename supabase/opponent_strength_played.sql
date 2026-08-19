-- Add `current_played` to opponent_strength so difficulty ratings can tell
-- "no games played yet" apart from "played and winless".
--
-- WHY
-- LZV publishes the full standings table from day one, with every team on
-- 0 played / 0 points. `getDifficulty()` gated only on `current_position` being
-- non-null, so before a ball was kicked it painted confident labels over an
-- arbitrary ordering of an all-zero table -- "Very hard" for a side relegated
-- last season, "Very easy" for a brand-new team with no history at all.
--
-- `current_ptn_per_match` cannot stand in for this: 0 points per match means
-- both "no games" and "lost every game". Only the played count separates them.
--
-- SEMANTICS (see src/utils/difficulty.js)
--   NULL -> unknown; trust `current_position` as before. This is what every row
--           synced before this column existed will have, so historical seasons
--           keep their ratings and nothing regresses.
--   0    -> the season has not started; the position is meaningless, so no
--           difficulty is shown at all rather than a confident wrong one.
--   >0   -> real standings; rate normally.
--
-- Idempotent, safe to re-run. `scripts/sync-palmares.mjs` populates the column
-- on its next run (monthly cron, or `npm run sync:palmares`).

alter table opponent_strength
  add column if not exists current_played integer;

comment on column opponent_strength.current_played is
  'Matches played this season per the LZV standings table. NULL = unknown (pre-dates the column), 0 = season not started, so current_position must not be trusted.';

-- Verification: expect the column to exist, and existing rows to show NULL
-- until the next palmares sync.
select season_slug,
       count(*)                                        as rows,
       count(*) filter (where current_played is null)  as unknown_played,
       count(*) filter (where current_played = 0)      as not_started,
       count(*) filter (where current_played > 0)      as with_results
  from opponent_strength
 group by season_slug
 order by season_slug;
