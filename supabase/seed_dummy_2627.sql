-- Dummy 26–27 season: clone 25–26 fixtures with dates +1 year, no scores.
-- Run in Supabase SQL Editor as a privileged role.
-- Safe to re-run. Prefer `npm run seed:2627` if this insert fails (extra NOT NULL columns on `games`).
--
-- If `delete from games` fails on FK, run these first, then re-run from the games delete:
--   delete from attendance where game_id in (select id from games where season_slug = '2627');
--   delete from player_stats where game_id in (select id from games where season_slug = '2627');

-- Games (new ids; child rows that reference game_id may need manual delete — see above)
delete from games where season_slug = '2627';

insert into games (
  id,
  season_slug,
  game_date,
  game_time,
  location,
  opponent,
  home_score,
  away_score,
  expected_goals,
  expected_assists
)
select
  gen_random_uuid()::text,
  '2627',
  (g.game_date + interval '1 year')::date,
  g.game_time,
  g.location,
  g.opponent,
  null,
  null,
  null,
  null
from games g
where g.season_slug = '2526'
order by g.game_date;

-- Opponent strength (same teams as 25–26 for difficulty chips / palmares-style data)
delete from opponent_strength where season_slug = '2627';

insert into opponent_strength (
  season_slug,
  team_id,
  name,
  last_synced,
  current_position,
  current_ptn_per_match,
  history,
  strength_score
)
select
  '2627',
  o.team_id,
  o.name,
  o.last_synced,
  o.current_position,
  o.current_ptn_per_match,
  o.history,
  o.strength_score
from opponent_strength o
where o.season_slug = '2526';
