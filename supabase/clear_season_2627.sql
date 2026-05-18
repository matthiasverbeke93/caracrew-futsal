-- Clear the 26-27 season until official fixtures are known.
-- Removes seeded/dummy fixtures and their dependent rows.

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

delete from opponent_strength
where season_slug = '2627';
