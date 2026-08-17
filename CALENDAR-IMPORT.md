# Loading the official 26-27 LZV calendar

> Written 2026-08-17, while 26-27 sits **empty** on purpose (the dummy season was wiped). Follow this the day
> LZV publishes. Nothing here needs re-deriving — the facts were verified against the live site and the DB.

## 0. Is the calendar out yet?

Two checks, both read-only, no credentials:

```bash
# a) The team page still says "no data known for the current season" while it is unpublished.
curl -s "https://www.lzvcup.be/teams/overview/742" | grep -o "nog geen gegevens bekend"

# b) LZV publishes an OFFICIAL iCalendar feed per team. Empty today; VEVENTs appear on publication.
curl -s "https://www.lzvcup.be/icalendar.php?id=742" | grep -c "BEGIN:VEVENT"
```

**Use feed (b) as the import source.** It is `text/calendar`, keyed to our team id (742), and carries exactly
the fields `games` needs — `DTSTART` (date + time), `SUMMARY` (both team names, so home/away order),
`LOCATION` (venue). It beats scraping HTML, and **neither existing sync script uses it** — this is new ground.
Confirmed live and well-formed on 2026-08-17, just with zero events.

## 1. Load the fixtures  ← the only real work

```bash
npm run calendar:import                                   # fetch live feed, preview the table
npm run calendar:import -- --out supabase/fixtures_2627.sql
```

`scripts/import-lzv-calendar.mjs` (logic in `src/utils/lzvCalendar.js`, 34 unit tests) does the parsing: it
reads the feed, prints a date/time/home-away/opponent/venue table to eyeball, and writes the SQL. Then paste
that into the **Supabase SQL editor** (the anon key cannot write to `games`; RLS is admin/service-role only. A
script could use `SUPABASE_SERVICE_ROLE_KEY`, which exists as a GitHub secret but is not on the dev box).

It handles the awkward parts already: folded lines, escaped commas, `TZID` wall-clock **and** `Z`/UTC DTSTARTs
(DST-correct, verified for both CEST and CET), all-day events via `--default-time`, and id collisions. The
generated SQL **never deletes** and its upsert never touches `home_score`/`away_score`, so it cannot undo a
result the score sync already fetched — deliberately unlike the retired `seed_season_2627.sql`.

**It refuses to emit SQL if anything is ambiguous** rather than guessing — unknown SUMMARY separator, our team
on both sides or neither, a foreign `TZID`, a missing kickoff time. That is on purpose: LZV had published
nothing when this was written, so the feed's exact SUMMARY layout is unverified. If it stops with
`unknown-summary-format`, LZV is using a separator that wasn't anticipated — add it to `SUMMARY_SEPARATORS`
in `src/utils/lzvCalendar.js` and re-run. Do not bypass the check: home/away is invisible in the app, so a
wrong guess only ever surfaces in subscribers' calendars.

Manual insertion is still fine — `sync-lzv.mjs` **only updates scores on rows that already exist** and only
parses lines that already carry a score, so it can never bootstrap a calendar either way.

Column mapping, from the real 25-26 rows:

| `games` column | Value | Notes |
|---|---|---|
| `id` | `2627-<YYYY-MM-DD>-<HHMM>-<opponent-slug>` | e.g. `2627-2026-09-10-2100-hattrick`. Matches the 25-26 convention exactly; deterministic, so a re-run can upsert on it |
| `season_slug` | `'2627'` | |
| `opponent` | Opponent name **as LZV spells it** | The score sync matches on this — see §7 |
| `game_date` | `YYYY-MM-DD` | From `DTSTART`. Must match LZV exactly — see §7 |
| `game_time` | `HH:MM:SS` | From `DTSTART` |
| `location` | Venue | Home is `De Nekker Mechelen`. **Not a reliable home/away signal** — De Nekker hosts other teams too, so we appear as the *away* side there sometimes |
| `title` | `K Caracrew SK vs <Opponent>` (home) / `<Opponent> vs K Caracrew SK` (away) | ⚠ **LOAD-BEARING, see below** |
| `home_score` / `away_score` | leave `null` | Filled by the weekly score sync. ⚠ Misleading names: `home_score` is always **our** goals, `away_score` always the opponent's, regardless of venue |

⚠ **`title` is the only place home/away is stored.** There is no home/away column. `isHomeGame()` in
`scripts/gen-ics.mjs` splits the title on `" vs "` *or* an embedded score and asks whether "caracrew" is in the
first half. Consequences:
- A title without `" vs "` **and** without a score loses home/away → the feed degrades to `Opponent: X`.
- Get the order wrong and the calendar tells subscribers the wrong venue side.
- The score sync never rewrites `title`, so whatever is authored here stands all season. Author the `" vs "`
  form and it keeps working after scores arrive.
- Nothing in `src/` reads `title` — it is consumed by the ICS generator only. So a mistake is invisible in the
  app and only shows up in people's calendars.

## 2. Opponent strength (difficulty ratings + projected table)

```bash
npm run sync:palmares      # or wait for the monthly workflow
```

Discovers the opponents **and** the standings from the same team overview page, so no per-season URL change is
needed. It writes `opponent_strength` keyed `(season_slug, team_id)`.

⚠ **Expect this to be thin or empty for the first few weeks.** It parses the *current* season's standings
table, which barely exists before a few rounds are played. The wiped dummy data had faked this using last
season's positions. So sidebar difficulty and the projected league table will look flat early on — that is
expected, not a bug. The job runs monthly, so consider one manual run once a few results are in.

## 2b. ⚠ Check the league size — the difficulty bands are hardcoded for ~12 teams

`levelFromPosition()` in `src/utils/difficulty.js` maps league position to a label with fixed cut-offs
(`≤3` Very hard, `≤5` Hard, `≤7` Medium, `≤9` Easy, everything else Very easy). That was tuned for 25-26's
**12 teams** (11 opponents + us), where it spreads 3/2/2/2/3. Measured against a 16-team league it collapses to
**3/2/2/2/7** — 44% of the division labelled "Very easy", and mid-table 10th of 16 called "Very easy".

**So: count the teams first.** If 26-27 is not ~12 teams, re-band before anyone reads a difficulty rating, ideally
by deriving the cut-offs from the league size (quintiles of `standings.length`) instead of absolute positions.
The wiped dummy season assumed 16 teams, which is why this surfaced.

## 2c. ⚠ A missing opponent silently borrows another team's rating

`findStrengthRow()` / `getOpponentStanding()` try an exact normalized match first (good), then fall back to a
**two-way substring** match. Verified behaviour: looking up `"Hattrick"` when only `"Hattrick B"` exists in the
standings returns **Hattrick B's** position — a confidently wrong difficulty rather than none. Exact-match-first
means this only bites when the real opponent is *absent* from `opponent_strength`, which is exactly the situation
early in a season before palmares has filled in. Worth an eye on any opponent whose name contains, or is
contained by, another's; the 25-26 set has no such pair (checked).

## 3. Calendar feeds

Automatic within a day — `sync-ics.yml` runs daily and the `SUPABASE_ANON_KEY` secret is confirmed present. To
force it:

```bash
set -a; . ./.env; set +a      # gen-ics.mjs reads process.env and does NOT load .env
npm run ics:gen
```

Then commit `public/fixtures-2627.ics` + `public/fixtures.ics`. `*.ics` is pinned `-text` in `.gitattributes`
(RFC 5545 needs CRLF) — don't undo that. Confirm the deploy pipeline actually republishes `public/*.ics`;
subscribers read the deployed file, not the DB.

## 4. Confirm the repo vars

`LZV_TEAM_URL` (742) and `LZV_OUR_TEAM_ID` (742) are still valid — verified 2026-08-17, the page resolves and
names the team. Defaults in the workflows already cover them.

⚠ **One inconsistency to fix:** `sync-lzv.yml` and `sync-palmares.yml` fall back to `'2627'` when
`vars.LZV_SEASON_SLUG` is unset, but `weekly-digest.yml` passes `DIGEST_SEASON_SLUG: ${{ vars.LZV_SEASON_SLUG }}`
with **no fallback**. Set the repo variable `LZV_SEASON_SLUG=2627` explicitly so all four jobs agree instead of
relying on per-workflow defaults.

## 5. Manual data files

- `src/data/seasonLeagueStandings.js` — `"2627": []`, with a comment saying to paste the new table. Fill it
  once LZV publishes the standings. Separate from `opponent_strength`, which §2 handles.
- `src/data/seasonTeamStatsOverrides.js` — **do nothing.** Overrides exist only for seasons where Supabase
  lacks attendance/stats; 26-27 is tracked live from day one. Adding a 2627 entry would *mask* real data.
- `src/seasons.js` — already correct, `2627` is `isDefault: true`. No change.

## 6. Verify before telling the team

```bash
node -e '...'   # or reuse the census pattern from the 2026-08-17 session
```

- fixture count matches the published calendar, and `game_date` spans the expected window
- no duplicate `(game_date, opponent)` pairs
- every row has a non-null `game_time` and `location`
- every `title` contains "caracrew", and the home/away split matches the real fixture list (a double
  round-robin should be an even split)
- `npm run ics:gen` reports the right VEVENT count, and spot-check one event's `Home vs` / `Away at` line
- in `npm run dev`: sidebar lists the fixtures, and RSVP is offered on the **next 3 upcoming** only
  (`attendance` is deliberately limited to those; stats lock 10 days post-game via `STATS_FREEZE_DAYS`)

## 7. Living with it afterwards — the two traps

**The score sync matches on `game_date` + fuzzy opponent name.** `findGameForMatch` filters to games on the
exact same date, then compares normalized opponent names (lowercase, punctuation stripped, `k.` → `k `,
substring match either way). So opponent spelling is forgiving but **the date must match LZV exactly**. A
mismatch is silent apart from a `No DB row for <date> vs <opponent>` warning in the workflow log — the score
just never lands. Check that log after the first few rounds.

**Reschedules: edit in place, never re-import.** The `id` encodes the date, so re-importing a moved match
creates a *second* row and leaves the original stranded. `attendance`, `player_stats`, `guest_players` and
`motm_votes` all FK to `game_id`, so a fresh row silently abandons every RSVP already collected. Update
`game_date` / `game_time` (and `location` / `title` if the venue side changed) on the existing row and keep the
id, even though the id then disagrees with the date. That is the lesser evil.
