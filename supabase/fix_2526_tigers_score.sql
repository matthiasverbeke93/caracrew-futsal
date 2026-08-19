-- ============================================================================
-- DATA FIX — the 2025-10-14 ZVC Tigers result is stored inverted.
-- Separate from fix_rls_lockdown.sql on purpose: that one is urgent and
-- mechanical, this one changes recorded history, so read the evidence first.
-- ============================================================================
--
-- THE ROW
--   id         2526-2025-10-14-2100-zvc-tigers
--   title      'ZVC Tigers 10 - 1 K Caracrew SK'   <- Tigers 10, us 1
--   stored     home_score = 10, away_score = 1     <- counted as a 10-1 WIN for us
-- `home_score` is by convention OUR goals regardless of venue, so the stored
-- pair says we won 10-1 while the title says we lost 1-10.
--
-- WHY THE TITLE IS THE ONE TO BELIEVE (audited 2026-08-19, all 22 rows)
--   * 20 of the 21 parseable titles agree exactly with their stored scores, so
--     the "home_score = our goals" convention is real and consistently applied.
--     This row is the only one that contradicts it.
--   * The decisive comparison is 'VV Schemerboyz 2 - 11 K Caracrew SK', stored
--     11-2. Same shape as the Tigers row: we are the away side, named second,
--     and our goals are the RIGHT-hand number. That row took the right number
--     and is correct; the Tigers row took the LEFT number and is not.
--   * Titles come from LZV's own results listing via the score sync, and the
--     sync never rewrites a title, so the text is the more trustworthy half of
--     the row. The home_score/away_score assignment is where a flip happens.
--   * It fits the season: 5W-2D-15L with a 1-11, a 1-8 and a 16-0 against us.
--     A 10-1 win over Tigers is the single largest result of the season and an
--     outlier; the reverse fixture two weeks later was a 2-2 draw.
--
-- EFFECT OF THE FIX (25-26 season record)
--   before   5W-2D-15L, GF 74, GA 127   (17 pts)
--   after    4W-2D-16L, GF 65, GA 136   (14 pts)
-- i.e. it removes 3 phantom points and an 18-goal swing from the season record
-- card, the projected league table and win%.
--
-- If you would rather keep the stored scores and correct the title instead, the
-- alternative is at the bottom. Run ONE of them, not both.
-- ============================================================================

begin;

update games
   set home_score = 1,     -- our goals
       away_score = 10     -- ZVC Tigers' goals
 where id = '2526-2025-10-14-2100-zvc-tigers'
   and home_score = 10     -- no-op if it was already corrected
   and away_score = 1;

commit;

-- Verification: expect 1-10, and the season totals to match the "after" line above.
select id, title, home_score, away_score
  from games
 where id = '2526-2025-10-14-2100-zvc-tigers';

select
  count(*) filter (where home_score >  away_score) as won,
  count(*) filter (where home_score =  away_score) as drawn,
  count(*) filter (where home_score <  away_score) as lost,
  sum(home_score)                                  as goals_for,
  sum(away_score)                                  as goals_against
  from games
 where season_slug = '2526' and home_score is not null;

-- ---------------------------------------------------------------------------
-- ALTERNATIVE, only if you know we really did win 10-1 and the TITLE is wrong.
-- Nothing in src/ reads `title` (the ICS generator does), so this is the
-- lower-impact edit if the scoreline as stored is the correct one.
--
--   update games
--      set title = 'K Caracrew SK 10 - 1 ZVC Tigers'
--    where id = '2526-2025-10-14-2100-zvc-tigers';
--
-- Note this also flips the fixture to a HOME game in subscribers' calendars,
-- which contradicts the stored location (Heiveld St-Katelijne-Waver, an away
-- venue) — further reason to think the title, not the score, is right.
-- ---------------------------------------------------------------------------
