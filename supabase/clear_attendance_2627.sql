-- Remove all attendance rows for 26–27 (season slug 2627).
-- Run in Supabase SQL Editor (service role or postgres).

delete from attendance
where game_id in (select id from games where season_slug = '2627');
