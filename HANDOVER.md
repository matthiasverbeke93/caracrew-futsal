# Futsal — session hand-over

> **Purpose:** orientation for a fresh Claude Code (or human) session on this project. It complements
> `README.md` (which is the canonical setup/feature reference) with the things you only learn by working here:
> current state, gotchas, and a running log of what changed and why.
>
> **Keep this file up to date.** At the end of any session that changes code or decisions, append a dated
> entry to the **Session log** below and adjust **Current state** / **Gotchas** if they moved. Keep it concise —
> link to code rather than duplicating it.

## What this is
`caracrew-futsal` — attendance, goals/assists and Man-of-the-Match tracker for **K. Caracrew SK** (LZV Cup).
Single-page app, **React 19 + Vite**, backed by **Supabase**. Reads are public; writes are RLS-scoped by role.
Deployed as a static build (GitHub repo: `matthiasverbeke93/caracrew-futsal`, branch `main`).

## Run / check
```bash
npm install
cp .env.example .env      # needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (present on this box, NOT in git)
npm run dev               # http://localhost:3000
npm run lint              # eslint (flat config) — must stay clean
npm run build             # vite build → dist/  (dist is gitignored)
npm test                  # vitest run — unit tests for src/utils/*.test.js
```
Verification = `lint` + `build` + `test`, plus a manual eyeball in `npm run dev`. Tests use **Vitest 4** (pairs
with Vite 8 here; the ARM64 rollup issue that pins the sibling Ambiorix project to Vitest 0.34 does **not** apply
on this machine) and cover the pure `utils/` logic in a `node` environment.
**No browser-automation tool is installed in this workspace**, so Claude sessions can't screenshot the running app —
UI changes are verified by build/lint and reasoning; ask the user to eyeball visual work.

## Architecture / where things live (`src/`)
- **`App.jsx`** — the shell: header, season switcher, sidebar + content layout, all the URL/query-param routing
  (`?season=`, `?game=`, `?player=`, `?team_stats=`), and modal/panel open-state. Composes everything.
- **`hooks/useFutsalData.jsx`** — the data core. Loads all Supabase tables for the active season, derives
  attendance/stats/status, and owns every write (`saveAttendance`, `saveStat`, `saveFinalScore`, `submitMotmVote`,
  `addGuestPlayer`, …). Writes are **optimistic** (update local state, then Supabase; on error, restore snapshot +
  `loadAll()`).
- **`hooks/useAuthSession.jsx`** — Supabase email/password auth + the linked player + admin flag.
- **`hooks/usePendingClaimsCount.js`** — admin badge for pending player claims.
- **`components/`** — presentational: `GameSidebar` (fixtures list + calendar + filters), `SelectedGamePanel`
  (match header, share, context, score, count grid), `AttendanceTab`, `StatsTab`, `MyNextGamesTiles`,
  `SeasonSwitcher`, `SeasonOverviewPage` (+ `HistoricalSeasonStats`), `AdminPanel`, auth/claim modals, `Tabs`,
  `FormChip`, `AccountChip`, `PlayerProfileModal`.
- **`seasons.js`** — season registry (`SEASON_OPTIONS`, `DEFAULT_SEASON_SLUG`) + the current/historical split
  (`CURRENT_SEASON_SLUG`, `HISTORICAL_SEASON_OPTIONS`, `isCurrentSeason`). **Adding a season starts here.**
- **`constants.js`** — team name, attendance options, the fixtures-filter definitions + conflict rules.
- **`utils/`** — pure logic: `game.js` (played/editable/freeze windows — **all date math is local-day string
  comparison**, see gotchas), `formatMatch.js`, `difficulty.js`, `motm.js`, `headToHead.js`, `opponent.js`,
  `seasonInsights.js`, `teamSeasonStats.js`, `playerCompliance.js`.
- **`data/`** — manual fallbacks: `seasonLeagueStandings.js`, `seasonTeamStatsOverrides.js`,
  `historicalSeasonStats.js` (pre-Supabase snapshots, 2017-18 →).
- **`index.css`** — one global stylesheet, plain CSS. **Design = "Refined Matchday":** calm `#F5F7FA` canvas,
  ink text, a single **deep-green** accent (`--accent #146c43`, white text sits on it — `--on-accent`), Inter
  body + Space Grotesk display (Google Fonts in `index.html`, system fallbacks), and a **light, minimalistic
  single-row header** (white, hairline bottom border, static/scrolls away — brand left, season+nav+account
  right). `:root` holds the
  whole palette: base tokens (`--surface-*`, `--text-*`, `--accent` / `--accent-strong` / `--accent-muted`,
  `--font-body` / `--font-display`) **plus** the semantic colour system — `--tone-*` (success/danger/warning/
  caution/info bg+fg pairs), `--signal-*` (readiness rails, toast accents), `--diff-*` (difficulty ramp),
  `--form-*`. **Use these tokens for any colour rather than new hex** — the accent is unified on green. Because
  the accent is dark, fills that use it need **light** text (`color: var(--on-accent)`), not dark.
  Brand colours (WhatsApp green) are intentionally left literal.
- **`components/ToastProvider.jsx` + `hooks/useToast.jsx`** — app-level toasts; `useToast().notify(msg, tone)`
  surfaces write failures (see below).
- **`scripts/*.mjs`** — Node sync jobs run by GitHub Actions.

## Data & external jobs
- **Supabase tables:** `games`, `players`, `attendance`, `player_stats`, `guest_players`, `motm_votes`,
  `opponent_strength`, `player_claims`. Every `games` / `opponent_strength` row carries a `season_slug`.
  Migrations live in `supabase/*.sql` and are idempotent/safe to re-run.
- **GitHub Actions:** `sync-lzv.yml` (weekly final scores from lzvcup.be), `sync-palmares.yml` (monthly opponent
  strength), `weekly-digest.yml` (Friday RSVP/MOTM digest email via Resend). Driven by repo vars
  `LZV_SEASON_SLUG` / `LZV_TEAM_URL` / `LZV_OUR_TEAM_ID` and secrets (`RESEND_API_KEY`, etc.).

## Domain rules that shape the code
- **Seasons:** multi-season via `season_slug` (`2526` = 25-26, `2627` = 26-27). `SeasonSwitcher` is a single
  season **dropdown** (next to the team name) listing all seasons newest-first; it defaults to
  `DEFAULT_SEASON_SLUG` (26-27). No current/historical split.
- **Roles:** anyone reads; a signed-in *linked* player edits their own attendance/stats; any signed-in user votes
  MOTM once/game; **admin** sets scores, manages guests/roster, and overrides anyone.
- **Editing windows:** attendance is editable only for the **next 3 upcoming fixtures**; stats lock **10 days**
  after a game (`STATS_FREEZE_DAYS`).
- **Roster thresholds:** ≤5 playing = "not enough", 6 = "just enough", ≥7 = "right amount"
  (`MIN_PLAYERS_WARNING`, `JUST_RIGHT_PLAYERS`).

## Gotchas
- 🔴 **`.env` IS TRACKED ON PURPOSE — do not untrack it until the deploy platform has the two variables.**
  It is listed in `.gitignore` but committed anyway, which looks like an accident and is not. **The deploy
  pipeline is not configured anywhere in this repo** (no wrangler/netlify/vercel config, no deploy workflow —
  only the four sync workflows), it builds from the repo, and the committed `.env` is its *only* source of
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. `src/lib/supabase.jsx:6` throws at module load when they are
  missing — a top-level throw in the entry chunk — so the app never mounts: HTML serves 200 and the page is
  blank. **This actually happened on 2026-08-17** (see the session log). Both values are `VITE_`-prefixed and
  therefore compiled into the public client bundle anyway, so nothing is kept secret by removing the file.
  To do it properly: set the two variables in the deploy platform, deploy, confirm a Supabase URL is still
  baked into the served bundle, and only then untrack.
  **Diagnostic if the page ever goes blank again:**
  `curl -s https://caracrew.org/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'` then
  `curl -s "https://caracrew.org<asset>" | grep -c 'supabase\.co'` — `0` means the build had no env.
- **Dates are local-day strings, not Date math.** `isPlayed`/editable checks compare `game_date` (`YYYY-MM-DD`)
  against a locally-formatted "today" string. This is intentional (fixes an earlier UTC off-by-one). Don't
  "fix" it by switching to UTC `Date` comparisons.
- **Optimistic writes.** All mutations in `useFutsalData` update state first and roll back on error. Keep new
  writes to that pattern (snapshot → mutate → on error restore + `notify(...)` toast + `loadAll()`).
- **Line endings:** repo is LF; on this Windows workspace git prints harmless `LF will be replaced by CRLF`
  warnings on add. Ignore them. **Exception — `*.ics` is pinned to `-text` in `.gitattributes`** (added
  2026-08-17): RFC 5545 mandates CRLF and `gen-ics.mjs` emits it, but `core.autocrlf=true` was normalizing
  the feeds to LF on every Windows commit while the Linux CI runner stored CRLF — a whole-file churn on all
  three feeds each sync, and a real risk of shipping an LF feed that strict clients (Outlook) reject.
  **Don't remove that rule, and don't "fix" the .ics files to LF.**
- **`file:` there is none** — single package, plain npm. No monorepo/workspaces.
- **Web fonts** come from Google Fonts (`index.html`); offline they fall back to a system sans — fine, just less
  distinctive. **Header is static** (scrolls away) by the user's choice — not sticky/fixed.
- **No component uses `React.memo`.** So memoizing callbacks in `useFutsalData` buys nothing on its own — don't
  add `useCallback` there expecting a win without also memoizing the heavy children (profile first).

## Current state (as of 2026-08-19)
- ✅ **The official 26-27 calendar is LOADED AND VERIFIED.** LZV published on/before 2026-08-19; the user ran
  `supabase/fixtures_2627.sql` in the SQL editor the same day. Verified read-only afterwards: **21 rows**,
  every `id` consistent with its own date/time/opponent, no duplicate ids or `(date, opponent)` pairs, no
  null `game_time`/`location`, every `title` carries the team, all scores still null, 11 opponents, span
  2026-09-06 → 2027-05-09, **2526 untouched at 22**, and no child-table rows point at 2627 yet.
  `.ics` feeds regenerated (21 VEVENTs, CRLF intact) and committed.
- 🔴 **STILL TO DO: set the repo var `LZV_SEASON_SLUG=2627`.** `weekly-digest.yml` passes it with **no
  fallback** (the other workflows default to `'2627'`), so the digest is the one job that misbehaves without it.
- ⚠ **DO NOT run `npm run sync:palmares` yet — and the 1 Sept cron will do it for you anyway.** The
  runbook predicted standings would be *thin or empty* before results exist. The reality is worse: LZV
  already serves a **full 12-team table in which every team has `ptn/m = 0`** — nobody has played. The
  positions (Oranje Duivels 1, Knallende Knapen 2, ZVC Tigers 3 … Bankzitters United 12) are an arbitrary
  ordering of an all-zero table, not a strength signal. `getDifficulty()` gates only on
  `current_position != null` and has **no zero-games guard**, so syncing paints confident difficulty labels
  over the whole fixture list — "Very hard" for Knallende Knapen, who were relegated 12th of 4e Klasse last
  season, and "Very easy" for Bankzitters United, a brand-new team (id 2668) with no history at all.
  **`sync-palmares.yml` fires `30 6 1 * *`, i.e. 1 Sept 06:30 UTC — before the season opener on 6 Sept** — so
  this lands automatically and self-corrects only on the 1 Oct run. Left as a decision, not silently changed.
  A proper guard is not a one-liner: `opponent_strength` persists `current_position` and
  `current_ptn_per_match` but **not `played`**, and `ptn/m = 0` cannot distinguish "no games" from "winless",
  so the fix needs the standings' `played` column persisted first.
- **The season: 21 fixtures, 2026-09-06 → 2027-05-09, 5e Klasse Mechelen, 12 teams.** 11 home / 10 away —
  the **22nd fixture (away at Bankzitters United) is marked "Nog te plannen"** by the league, so the
  double round-robin is incomplete on LZV's side, not ours. Re-running the importer once it is scheduled
  adds that row (the SQL upserts and never deletes).
- **The home venue moved: De Nekker → `Winketkaai Mechelen`.** Also note **2027-04-24 at Winketkaai is an
  away game** — the documented "location is not a home/away proxy" trap, now real in the data.
- **Opponents largely turned over from 25-26.** In: VT 09, Oranje Duivels, Jan Breydel, Bankzitters United,
  Knallende Knapen. Out: Futsal Opsinjoor, FC Tzit Ni Mee, Hattrick, Los Dollos, FC De Planeet. Kept: VV
  Schemerboyz, De Karpervissers, 04United, ZVC Tigers, Wille ma ni kunne, FC Tripel.
- ✅ **The two CALENDAR-IMPORT.md worries both came out clean against the real list**: 12 teams is what
  `difficulty.js`'s bands were tuned for (no re-banding), and no opponent name is a substring of another
  (no borrowed-rating risk).

### Superseded (as of 2026-08-17)
- **The 26-27 dummy season is GONE and 26-27 is now EMPTY, awaiting the official LZV calendar.** The wipe
  ran and was verified: `games` 0, `opponent_strength` 0, no orphaned child rows anywhere, and 25-26 still
  intact at 22 games / 11 opponents. The `.ics` feeds were regenerated, so 26-27 publishes a valid empty
  calendar rather than fake fixtures.
- **When the official calendar arrives → follow [`CALENDAR-IMPORT.md`](./CALENDAR-IMPORT.md)**, a step-by-step
  runbook written 2026-08-17 with every fact verified against the live site and DB. Headlines: LZV publishes an
  **official per-team iCalendar feed** (`https://www.lzvcup.be/icalendar.php?id=742`) that is the right import
  source and that no existing script uses; **fixtures must be inserted manually** because `sync-lzv.mjs` only
  updates scores on rows that already exist; `title` is the **only** store of home/away; and after go-live the
  two traps are the score sync's exact-date matching and reschedules (edit in place, never re-import, or every
  RSVP is orphaned).
- ⏳ **As of 2026-08-17 the calendar is NOT published** — the LZV team page still reads *"Voor deze ploeg zijn
  nog geen gegevens bekend voor het huidige seizoen"* and the official feed returns 0 events. Team id **742**
  is still valid.
- 🔴 **OPEN DATA BUG (25-26, found 2026-08-17): the 2025-10-14 ZVC Tigers result is stored inverted.** The
  `title` reads `ZVC Tigers 10 - 1 K Caracrew SK` (a 1-10 defeat) but the row stores `home_score=10,
  away_score=1`, and `home_score` is by convention **our** goals — so the app counts it as a **10-1 win**. That
  is 3 phantom points and an 18-goal swing in the season record card, the projected league table and win%.
  An audit of all 22 scored 25-26 games found **this one row only** (20 consistent, 1 unparseable title), so
  the "us first" convention itself is sound. Needs a human call on which side is right — LZV had no 25-26 data
  left to check against. Fix once decided:
  `update games set home_score = 1, away_score = 10 where id = '2526-2025-10-14-2100-zvc-tigers';`
- ⚠ **Everything 26-27 reads empty until then** — sidebar has no fixtures, Stats page charts show their
  empty states, no difficulty ratings. That is expected, not a bug. Verified safe 2026-08-17: every stats
  util returns zeroed/empty structures (no division-by-zero) and every chart on the Stats page has an empty
  guard; the projected league table self-hides (`leagueTable.length > 1`, and with no opponents it is 1).
- ✅ **The `SUPABASE_ANON_KEY` secret question from 2026-07-03 is RESOLVED — it was added.** `sync-ics.yml`
  works: `origin/main` carries `chore: refresh calendar feeds [skip ci]` commits from 2026-07-03 and
  2026-08-02. So the feeds **self-heal daily** and the manual `ics:gen` above is belt-and-braces, not the
  only path. Corollary: the 30 dummy fixtures were being re-published daily right up to this wipe.

## Earlier state (as of 2026-07-02)
- **Refined Matchday UI**: light minimalistic single-row header, **deep-green** accent, Inter/Space Grotesk,
  calm canvas. (Earlier in the day this was a dark ink header + amber accent — since changed per the user.)
- **Header** (one row): team name + a single **season dropdown** (all seasons, defaults to current) + FORM chips
  on the left; "Stats" button, LZV link, and the **account dropdown** (username → Admin panel / Sign out) on the
  right.
- **Season Stats page** carries a **stacked-bar** squad-size-per-game chart (roster vs guests), styled like the
  historical trend cards.
- Foundations in place: sidebar/panel declutter, write-failure toasts, semantic colour tokens, Vitest `utils/`
  coverage (23 tests), vite 8.1.3, code-split overlays (~457 KB initial), keyboard nav in the dropdown menus.
- Deliberately **not done**: memoizing `useFutsalData` writes (no `React.memo` children → no benefit; needs
  profiling). Possible future: further visual polish, self-hosting fonts, dark mode (tokens ready), folding
  guests into more of the season metrics/tables.

## Session log
- **2026-08-19** — *The official 26-27 calendar went live; imported it (DB load still pending).*
  - **The importer refused all 21 fixtures on first run, exactly as it was designed to.** LZV's SUMMARY
    separator is a **bare, unpadded hyphen** (`VT 09-K Caracrew SK`) and every separator in the list was
    space-padded. The refusal was the feature working — it is the case §1 of CALENDAR-IMPORT.md predicted.
  - **Fixed it without the obvious-but-wrong fix.** Adding `"-"` to `SUMMARY_SEPARATORS` would split
    `ZVC St-Katelijne-Waver` at its first hyphen. Instead `splitOnBareHyphen()` makes **our own name the
    arbiter**: a hyphen is the separator only if "caracrew" lands on exactly one side; if several hyphens
    qualify it prefers the one whose our-side is exactly our team name, else it still returns null and the
    fixture gets reported. So the no-guessing contract survives.
  - **Added `normalizeLocation()`** — the feed gives `Venue, Street 12, City`, the table stores `Venue City`.
    Keeping the first + last comma part reproduces the existing 25-26 spelling **exactly** for four of the
    five venues in the feed, which is why it is trustworthy rather than a guess at a format.
  - **Regression evidence for both:** regenerating the feeds left `fixtures-2526.ics` **byte-identical**, so
    no existing home/away call moved. 73 tests pass (13 new), lint clean.
  - **Verified home/away independently**, since it is invisible in the app: parsed the team-overview HTML and
    compared all 21 fixtures — home team, away team *and* kickoff — against the feed. Full match. Also
    confirms the UTC→Europe/Brussels conversion, including the 2027-03-27 fixture that sits one day before
    DST starts.
  - **Wrote `supabase/fixtures_2627.sql`** (21 fixtures). ⚠ **NOT YET RUN — needs the Supabase SQL editor.**
  - **Then the user ran the SQL.** Verified the load read-only (21 rows, ids self-consistent, no dupes, no
    nulls, scores null, 2526 intact, no orphaned children), regenerated the `.ics` feeds (21 VEVENTs, CRLF
    intact, `fixtures-2526.ics` unchanged) and spot-checked the awkward event: 2027-04-24 at our own
    Winketkaai hall correctly reads **"Away at FC Tripel"**.
  - ⚠ **New finding — palmares would poison the difficulty ratings if synced now.** See Current state: LZV
    serves a full standings table with `ptn/m = 0` for all 12 teams, and `getDifficulty()` has no
    zero-games guard. The 1 Sept cron will write it automatically, before the 6 Sept opener.
  - **Findings recorded in Current state / CALENDAR-IMPORT.md:** the 22nd fixture is unscheduled by the
    league ("Nog te plannen"), the home venue moved to Winketkaai, one away game is *at* Winketkaai, and the
    §2b/§2c worries both came out clean (12 teams, no substring-colliding opponent names).
- **2026-08-17** — *Calendar importer + a general bug sweep.*
  - **New: `npm run calendar:import`** (`scripts/import-lzv-calendar.mjs`, logic in
    `src/utils/lzvCalendar.js`, **34 unit tests**). Reads LZV's official iCalendar feed, previews the fixture
    table, writes idempotent SQL. Handles folded lines, escaped text, `TZID` **and** `Z`/UTC DTSTARTs
    (DST-verified for CEST *and* CET), all-day events, id collisions. The SQL never deletes and its upsert
    never touches the scores — deliberately unlike the retired seed. It **refuses to emit SQL on any
    ambiguity** (unknown separator, our team on both/neither side, foreign TZID, no kickoff time) because the
    feed's SUMMARY layout could not be observed while LZV had nothing published. Verified end-to-end against
    the live empty feed and a synthetic one.
  - 🐛 **FIXED — `isHomeGame()` reported every `" - "` separated title as HOME, including away fixtures.** Its
    regex only knew `" vs "` and score separators; with neither present, `split` returned the whole string and
    `/caracrew/` matched somewhere in it, so the answer was always `true`. `"Futsal Opsinjoor - K Caracrew SK"`
    (away) resolved to home. Replaced with the shared `isHomeFromTitle()` in `src/utils/lzvCalendar.js`, which
    reuses `splitSummary` (it treats a score as a separator too, so both existing title shapes still work) and
    returns **null instead of guessing**. Regenerating the feeds afterwards produced a **byte-identical**
    `fixtures-2526.ics`, proving the fix changed no current output — only one live row uses that form and it
    happened to be home. 5 regression tests, including the exact title that exposed it.
  - **Data sweep across every table** (duplicate fixtures, orphaned/unknown FKs, duplicate
    attendance/stats/votes, half-set scores, negative scores, blank/duplicate player names, missing
    time/location/title, opponents with no strength row, substring-colliding opponent names): **clean apart
    from the two title/score issues already listed.** 22 games, 13 players, 36 attendance, 10 stats, 1 vote.
  - **Two findings left as decisions, both recorded in `CALENDAR-IMPORT.md` §2b/§2c** because they bite at
    go-live: the difficulty bands are hardcoded for a ~12-team league (a 16-team league puts 44% of the
    division in "Very easy", including mid-table 10th), and a missing `opponent_strength` row lets a
    substring-sibling team's rating be shown instead of none.
  - **Noted, not changed:** `isMotmVotingOpen()` gates on `isPlayed()`, which is day-granular, so for a 21:00
    kickoff the designed window (kickoff + 2h = 23:00) stays shut until midnight — roughly the first hour, and
    the likeliest hour for people to vote, is lost. 22:00 away kickoffs are unaffected. Related wart: the
    function accepts `nowMs` but the `isPlayed` gate inside it ignores it, so the parameter gives a misleading
    sense of injectability and the behaviour can't be fully unit-tested.
- **2026-08-17** — *Calendar-import runbook + a 25-26 score audit.* Wrote
  **[`CALENDAR-IMPORT.md`](./CALENDAR-IMPORT.md)** so the go-live is mechanical. What the investigation turned
  up, none of it previously written down:
  - **LZV publishes an official per-team iCalendar feed** — `https://www.lzvcup.be/icalendar.php?id=742`,
    live, `text/calendar`, currently 0 events. Structured `DTSTART`/`SUMMARY`/`LOCATION` — the right import
    source, and nothing in the repo uses it.
  - **`sync-lzv.mjs` cannot bootstrap a calendar.** It only updates `home_score`/`away_score` on rows that
    already exist, and only parses lines that already carry a score, so it never sees upcoming fixtures.
    Fixture insertion is unavoidably a separate one-off.
  - **`title` is the sole store of home/away** (`isHomeGame()` splits on `" vs "` or a score and looks for
    "caracrew" in the first half). There is no home/away column, `location` is not a proxy for it (De Nekker
    hosts other teams, so we are sometimes the away side at our own venue), and nothing in `src/` reads
    `title` — only the ICS generator does, so an error is invisible in the app and shows up only in
    subscribers' calendars.
  - `game_id` encodes the date, so **a reschedule must be edited in place** — re-importing creates a second
    row and orphans every RSVP, since four tables FK to `game_id`.
  - `weekly-digest.yml` passes `vars.LZV_SEASON_SLUG` with **no fallback** while the other two workflows
    default to `'2627'`. Set the repo var explicitly.
  - **Found a real data bug**: the 2025-10-14 ZVC Tigers result is stored inverted (counted as a 10-1 win
    instead of a 1-10 defeat). Audited all 22 scored 25-26 rows — only that one. See Current state.
- **2026-08-17** — *Took caracrew.org down by untracking `.env`, reverted.* The site served HTTP 200 with a
  blank page. Cause: `87b4d43` untracked `.env`, the deploy pipeline builds from the repo and had no env vars of
  its own, so the bundle was built without `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, and
  `src/lib/supabase.jsx:6` throws at module load, so nothing mounted. Diagnosed by comparing the deployed bundle
  against a local build: the deployed one had **no** `*.supabase.co` string in it. Reverted in `b85bce0` rather
  than fixing forward, because reverting restored service immediately; recovery confirmed by polling until the
  served asset hash flipped and the URL reappeared, then checking all assets and all three feeds return 200.
  **Why the pre-flight check missed it:** I grepped `.github/workflows/` and `scripts/` for `.env` dependants and
  found only comments. But **the deploy pipeline is not in the repo at all**, so the one consumer that mattered
  was invisible to that grep. The check should have been "does the *deployed* bundle still contain a Supabase
  URL after this change", not "does anything in-repo read the file". Recorded as a gotcha above.
- **2026-08-17** — *Untrack `.env`.* ⚠ **Reverted the same day — see the entry above. Do not redo this.** It was tracked despite being in `.gitignore` (committed before the rule
  existed; gitignore does not retroactively untrack), so it was being published on every push.
  `git rm --cached .env` — the local file is untouched and now genuinely ignored. Nothing depended on the
  committed copy: the workflows read `secrets.SUPABASE_URL` / `secrets.SUPABASE_ANON_KEY`, and the only
  `.env` mentions in `scripts/` are comments. **A fresh clone now needs `cp .env.example .env`** (README
  already said so).
  ⚠ **The two values remain in git history** — untracking does not purge past commits. That is accepted, not
  overlooked: both are `VITE_`-prefixed and therefore compiled into the public client bundle already, so
  nothing secret was exposed. The point of untracking is forward-looking — `.env.example` documents
  `RESEND_API_KEY` as belonging in `.env`, and while the file was tracked a routine `git add -A` would have
  published a real secret. **If a genuine secret ever does land in a commit, untracking is not enough** —
  that needs a history rewrite (git-filter-repo/BFG) plus a force-push and a key rotation.
- **2026-08-17** — *Retire the 26-27 dummy season (official calendar imminent).*
  - **Census first** (read-only, anon key, via the public REST API): 2627 held **30 games, 15
    `opponent_strength`, 61 `attendance`, 3 `guest_players`, 0 `player_stats`, 0 `motm_votes`**, fixture
    window 2026-09-10 → 2027-05-06, **0 fixtures scored**. Diffing the live `attendance` against the seed
    file's `(game_id, player_id)` pairs showed **60 seeded + 1 real** — Matthias's own `if_needed` RSVP on
    the dummy opener, made 2026-07-03 while testing. So nothing of value is lost. 2526 (22 games / 11
    opponents) is not referenced by any of this.
  - **Pre-flight check that mattered:** 2627 is `DEFAULT_SEASON_SLUG`, so a wipe empties the landing view
    for everyone. Probed every stats util with empty/undefined inputs — `computeTeamRecord`,
    `buildLeagueTable`, `buildGoldenBootRace`, `buildMonthlyTeamGaSeries`, `buildPlayersPerGameSeries`,
    `seasonPlayedSummary`, `buildTeamSeasonPlayerRows`, `sortTeamSeasonRows` — **all return zeroed/empty
    structures, none throw**, and `SeasonOverviewPage` guards each chart on `length === 0`. Empty season
    degrades gracefully; no defensive code was needed.
  - `supabase/clear_season_2627.sql` **upgraded**: wrapped in `begin/commit` (so a mid-way error rolls
    back rather than half-clearing), documented as SQL-editor-only with the reason, and given a final
    verification `select` that must show six zeros plus 2526 still at 22/11. Delete set unchanged — it
    already matched the seed's own clear block exactly.
  - `supabase/seed_season_2627.sql` **deleted**. It began by deleting every 2627 row before re-inserting
    dummies, so leaving it next to a real calendar was a loaded footgun. `scripts/gen-seed-2627.mjs` is
    kept (a test env may need repopulating) with a **RETIRED** header spelling out that hazard.
  - **Wipe executed by the user in the SQL editor, then verified from here** (read-only): 2627 at 0 games /
    0 opponents, 2526 still 22/11, and an anti-join of all four child tables against the surviving game ids
    found **0 orphans** (36 attendance / 10 player_stats / 0 guests / 1 motm remain, all 2526).
  - **`.ics` feeds regenerated** (`npm run ics:gen`): `fixtures-2627.ics` and its default-season mirror
    `fixtures.ics` are now valid **empty** `VCALENDAR`s (−940 lines) — subscribers keep the subscription and
    the fake events simply vanish, which is why the feeds were regenerated rather than deleted.
    `fixtures-2526.ics` did **not** change, confirming the stable-`DTSTAMP` design works. Gotcha: `ics:gen`
    reads `process.env` only (no dotenv) — locally do `set -a; . ./.env; set +a` first, else it exits
    "Missing SUPABASE_URL/ANON_KEY".
  - **Found while pushing: the `.ics` feeds were caught in a CRLF/LF ping-pong.** `origin/main` had two
    `chore: refresh calendar feeds` commits (so the `SUPABASE_ANON_KEY` secret *does* exist and the daily job
    works). Their diff touched all 1357 lines of all three feeds, but the content was identical — the CI
    runner stores CRLF while `core.autocrlf=true` made this box store LF. Not cosmetic: RFC 5545 requires
    CRLF, so a Windows-committed feed could reach subscribers LF-normalized. Fixed with a `.gitattributes`
    pinning `*.ics -text`. Proof it really was only line endings: once pinned, our regenerated
    `fixtures-2526.ics` matched `origin/main` byte-for-byte and dropped out of the diff.
  - Rebased onto those two remote commits; conflicts were confined to the 2627 feeds and were resolved by
    **regenerating** them (they are build artefacts — never hand-merge ICS text).
  - Gates: `npm run lint` clean, `npm test` 33/33, `npm run build` OK.
- **2026-07-03** — *Three Stats/UX features: season record, Golden Boot race, calendar feed.*
  - **Season record & projected league table** (`utils/teamRecord.js` + tests): `computeTeamRecord` (W-D-L,
    GF/GA, GD, points at 3-1-0, ppg, win%, chronological results) and `buildLeagueTable` (LZV opponent snapshot
    with our computed pts/match inserted + ranked). Rendered at the top of the Stats page (`SeasonOverviewPage`,
    current tab) as a KPI card + results timeline + a highlighted league table. `opponentStrengths` now threads
    from `App` into the page.
  - **Golden Boot race** (`utils/goldenBoot.js` + tests): `buildGoldenBootRace` builds monotonic cumulative
    per-player scoring across played fixtures for the top 5, with a **Goals / G+A** toggle. Drawn as a multi-line
    SVG (`GoldenBootRaceChart`, Okabe–Ito colour-blind-safe palette + legend with totals). Ungated like the
    squad-size chart (reads per-game stats, so it works for 25-26 too).
  - **Calendar subscription (.ics)**: `scripts/gen-ics.mjs` (`npm run ics:gen`) writes `public/fixtures-<slug>.ics`
    (+ `fixtures.ics` mirroring the default season) from the public REST endpoint (anon key, no service role).
    RFC-5545 output with a Europe/Brussels VTIMEZONE and line folding; `DTSTAMP` is derived from the latest
    fixture date (stable, so scheduled regens only diff when fixtures change). New workflow
    `.github/workflows/sync-ics.yml` (daily + dispatch + on-script-change) regenerates and commits the feeds —
    **needs a `SUPABASE_ANON_KEY` repo secret** (`SUPABASE_URL` already exists). UI: a **Subscribe** link in the
    sidebar toolbar (`GameSidebar`) → `webcal://<host>/fixtures-<season>.ics`. Vite copies `public/*.ics` to
    `dist/` root, so they serve at `/fixtures-2627.ics` (live, `text/calendar`). Feeds for 25-26 (22) and
    26-27 (30) are committed. The sidebar **Subscribe** control is a `<details>` popover (`CalendarSubscribe`)
    offering Google (add-by-URL), Apple/phone (`webcal://`), and a **copyable https URL** — the last is required
    for Outlook.com's "Subscribe from web", which rejects `webcal:` scheme. Each VEVENT carries rich metadata:
    competition/season, home/away + opponent, venue, opponent form (position + pts/match, from
    `opponent_strength`, matched like `utils/difficulty.js`), result for played games, a `URL:` + "Match page"
    deep-link to `/?game=<id>&season=<slug>` (base from `SITE_URL`/`PUBLIC_APP_URL`/`VITE_SITE_URL`, default
    `https://caracrew.org`), plus `CATEGORIES`/`STATUS`.
- **2026-07-03** — *Readiness label + next-games tile alignment.*
  - Renamed the ≥7 readiness label **"Just the right amount" → "Enough players"** (`utils/game.js`
    `playerStatusLabel`), so per-game statuses read Not enough / Just enough / **Enough** players. Matched the
    sidebar filter labels in `constants.js` (`players_right` → "Enough players" in both `GAME_FILTERS` and
    `GAME_EXTRA_FILTERS`).
  - Fixed the "next games" tiles (`MyNextGamesTiles`): the RSVP buttons are bottom-anchored
    (`.my-next-game-actions { margin-top:auto }`), but a tile without a Clear/Marked footer (e.g. the currently-
    selected "Soonest" tile) dropped its buttons lower than tiles that had one. Wrapped Clear + "Marked …" in a
    `.my-next-game-footer` with a reserved `min-height` so the buttons line up tile-to-tile in every RSVP state.
- **2026-07-03** — *26-27 dummy-season seed.* Added `supabase/seed_season_2627.sql` (+ its generator
  `scripts/gen-seed-2627.mjs`) to populate the 26-27 season for testing. **16-team league** → 30-game double
  round-robin vs 15 opponents, weekly Thursdays **2026-09-10 → 2027-05-06** (Christmas/krokus/Easter gaps),
  round 1 home @ De Nekker 21:00, round 2 away @ opponent venues 22:00. Also seeds `opponent_strength` (the 15
  standings rows, drives sidebar difficulty), RSVP `attendance` on the first 6 fixtures, and 3 ad-hoc guests.
  **All fixtures are UPCOMING** (per the user) — no scores / `player_stats` / MOTM, since today (pre-season) is
  before the whole window so nothing is "played". Idempotent (clears 2627 first). Run it in the **Supabase SQL
  editor** — anon key can't write (RLS: games/players/opponent_strength are admin/service-role only, verified 401).
- **2026-07-02** — *Season switcher & UI declutter.*
  - `158e78d` Foreground 26-27 season; older seasons moved into a new `SeasonSwitcher` dropdown
    (`CURRENT_SEASON_OPTION` / `HISTORICAL_SEASON_OPTIONS` added to `seasons.js`).
  - `bed3240` Declutter: sidebar readiness became a 4px left rail (was a full-card wash); sidebar difficulty is
    now muted text; "Stats missing" folded into the status pill; the panel's 3 share buttons collapsed into a
    "Share ▾" dropdown and the head-to-head meta-list moved behind a "Match context" `<details>`.
  - Ran a code review the same session — the flagged "bugs" were verified as **false positives** (local-day date
    handling is correct, `saveStat`/`saveFinalScore` guards already present). No fixes were warranted.
- **2026-07-02** — *Reliability + quality pass (4 improvements).*
  - **Write-failure toasts:** new `ToastProvider` / `useToast`; every optimistic-write error path in
    `useFutsalData` now calls `notify(...)` instead of failing silently.
  - **Tests:** added Vitest 4 (`npm test`) + 20 unit tests for `game.js`, `motm.js`, `opponent.js`.
  - **Colour tokens:** consolidated the status-colour hex into a semantic `:root` palette (`--tone-*` /
    `--signal-*` / `--diff-*` / `--form-*`); no visual change.
  - **Header:** dropped the "Team dashboard" eyebrow.
- **2026-07-02** — *UI overhaul ("Refined Matchday") + follow-ups.*
  - Overhaul: static ink header w/ amber stripe (was a floating sticky card, per user choice), Inter + Space
    Grotesk, calm `#F5F7FA` canvas, softer shadows/radii, and **accent unified on amber** — reconciled all the
    stray blue accents into the amber token system (dark-amber text on light, amber fills/borders/tints).
  - `vite` → 8.1.3 (fixes the high `server.fs.deny` advisory).
  - `React.lazy` code-split for AdminPanel / SeasonOverviewPage / PlayerProfileModal (498 → 457 KB initial).
  - Keyboard roving focus in the dropdown menus (`utils/menuNav.js`).
  - Decided **against** memoizing `useFutsalData` writes — no memoized children, so zero benefit + real risk.
- **2026-07-02** — *Header + colour refinements.*
  - Header: collapsed to a single row (brand left; season switcher, "Stats" button, LZV link, account right),
    made it **light/minimalistic** (white, hairline border, narrower) and inverted all its interior text to
    dark-on-light. Renamed "Season overview" → **Stats**.
  - Accent recoloured **amber → deep green** (`#146c43`); added `--on-accent` and flipped every accent-fill
    control to light text (dark green needs it).
  - Bottom-aligned the RSVP controls in the "next games" tiles so they line up when names wrap. (Other
    tile/label alignment awaits a screenshot to pinpoint.)
- **2026-07-02** — *Header dropdowns.*
  - `AccountChip` is now a **dropdown**: the username is the trigger; Admin panel + Sign out live in the menu
    (pending-claims count shows as a dot on the trigger + a badge on the Admin item).
  - `SeasonSwitcher` collapsed to a **single season dropdown** (all seasons, newest-first, defaults to current),
    moved next to the team name. Removed the current/historical split (+ the now-dead `seasons.js` helpers).
  - Aligned sidebar card metadata (fixed 40px RSVP slot) and the goals/assists tally badges.
- **2026-07-02** — *Squad-size chart.* Added a squad-size chart to the season Stats page (current tab), one bar
  per played fixture. Now a **stacked bar** (roster = `player_stats.played`, guests = `guest_players.status
  === "playing"`), built by `buildPlayersPerGameSeries(games, stats, guestPlayers)` (`seasonInsights.js`,
  tested) and drawn by `PlayersPerGameChart` in `SeasonOverviewPage`. It is **not** gated by
  `showLiveSeasonInsights` — it reads per-game stats, which exist for 25-26 too. `guestPlayers` is now passed
  from `App.jsx` to the page. Polished into a titled card (`.history-chart-card` + `.history-chart-head` with
  legend) to match the historical trend charts.
