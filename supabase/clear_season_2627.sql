-- Clear the 26-27 season, ahead of loading the OFFICIAL LZV calendar.
-- Removes the dummy/seeded fixtures (from the retired seed_season_2627.sql) and every dependent row.
--
-- Run in the Supabase SQL editor: the anon key cannot write to games / opponent_strength
-- (RLS makes those admin/service-role only), so this cannot be run from the app or a local script.
--
-- Touches ONLY season_slug = '2627'. Season 2526 and the players roster are never referenced.
-- Safe to re-run: every statement is an unconditional delete on a 2627 filter.
--
-- Census taken 2026-08-17 before the wipe — expected deletions:
--   games 30 | opponent_strength 15 | attendance 61 | guest_players 3 | player_stats 0 | motm_votes 0

begin;

-- Dependents first. (guest_players and motm_votes also cascade from games, but be explicit —
-- attendance and player_stats are deleted by filter, so order matters for those two.)
delete from motm_votes
where game_id in (select id from games where season_slug = '2627');

delete from player_stats
where game_id in (select id from games where season_slug = '2627');

delete from attendance
where game_id in (select id from games where season_slug = '2627');

delete from guest_players
where game_id in (select id from games where season_slug = '2627');

delete from games
where season_slug = '2627';

-- Opponent strength is rebuilt for the real opponents by the monthly `sync-palmares` job
-- (or `npm run sync:palmares`) once the official fixtures are in.
delete from opponent_strength
where season_slug = '2627';

commit;

-- Verification: every count must be 0, and the 2526 columns must still read 22 / 11.
select
  (select count(*) from games where season_slug = '2627')             as games_2627,
  (select count(*) from opponent_strength where season_slug = '2627') as opponents_2627,
  (select count(*) from attendance a
     join games g on g.id = a.game_id where g.season_slug = '2627')   as attendance_2627,
  (select count(*) from guest_players gp
     join games g on g.id = gp.game_id where g.season_slug = '2627')  as guests_2627,
  (select count(*) from player_stats ps
     join games g on g.id = ps.game_id where g.season_slug = '2627')  as stats_2627,
  (select count(*) from motm_votes mv
     join games g on g.id = mv.game_id where g.season_slug = '2627')  as motm_2627,
  (select count(*) from games where season_slug = '2526')             as games_2526_intact,
  (select count(*) from opponent_strength where season_slug = '2526') as opponents_2526_intact;
