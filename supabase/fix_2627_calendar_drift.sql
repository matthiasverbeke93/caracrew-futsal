-- 26-27 calendar drift, caught 2026-09-04 by diffing LZV's live feed against `games`.
-- Run in the Supabase SQL editor: the anon key cannot write to `games` (RLS: admin/service-role).
--
-- WHY THIS IS HANDWRITTEN AND NOT `npm run calendar:import`:
-- `games.id` encodes the kickoff time (`<season>-<date>-<hhmm>-<opponent>`), so a MOVED KICKOFF
-- changes the id. The importer's `on conflict (id) do update` would therefore NOT match the
-- existing row — it would INSERT A SECOND ROW and orphan every RSVP (attendance / player_stats /
-- guest_players / motm_votes all FK to game_id). Fixture 1 already has 14 RSVPs (7 In), so it is
-- updated IN PLACE and keeps its old id. The id is opaque — the app reads game_time/location.
-- CALENDAR-IMPORT.md says the same thing about a changed date; it is true of the time too.

begin;

-- 1. Fixture 1 moved (LZV LAST-MODIFIED 2026-09-03 15:32Z): 21:00 -> 20:00, and the hall changed
--    from Winketkaai to IHAM. Same date, same opponent, so the id is deliberately left alone.
update games
   set game_time = '20:00:00',
       location  = 'IHAM Mechelen'
 where id = '2627-2026-09-06-2100-vt-09';

-- 2. LZV renamed the club: "Bankzitters United" is now "FC De Wandelgang". Date, time and venue
--    are unchanged, so again an in-place update (this fixture keeps its ...-bankzitters-united id).
update games
   set opponent = 'FC De Wandelgang',
       title    = 'K. Caracrew SK vs FC De Wandelgang'
 where id = '2627-2027-01-28-2100-bankzitters-united';

-- 3. The away leg at FC De Wandelgang was added to the feed on 2026-08-24, after the season seed —
--    it is missing from `games` entirely. Safe plain insert with the feed-derived id.
insert into games (id, season_slug, opponent, game_date, game_time, location, title) values
  ('2627-2027-02-27-2030-fc-de-wandelgang', '2627', 'FC De Wandelgang', '2027-02-27', '20:30:00', 'Winketkaai Mechelen', 'FC De Wandelgang vs K. Caracrew SK')
on conflict (id) do update set
  opponent  = excluded.opponent,
  game_time = excluded.game_time,
  location  = excluded.location,
  title     = excluded.title;

commit;

-- Verification: expect 22 fixtures, fixture 1 at 20:00 in IHAM Mechelen with its 14 RSVPs intact,
-- and no row left mentioning Bankzitters United.
select
  (select count(*) from games where season_slug = '2627')                                as fixtures,
  (select count(*) from games where season_slug = '2627' and opponent = 'FC De Wandelgang') as wandelgang_legs,
  (select count(*) from games where season_slug = '2627' and opponent ilike '%bankzitters%') as stale_name,
  (select count(*) from attendance where game_id = '2627-2026-09-06-2100-vt-09')          as fixture1_rsvps,
  (select game_time || ' @ ' || location from games where id = '2627-2026-09-06-2100-vt-09') as fixture1_when;
