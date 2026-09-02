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
- **`hooks/useAuthSession.jsx`** — Supabase email/password auth + the linked player + admin flag,
  plus the password-reset/recovery pair (`requestPasswordReset`, `updatePassword`, `recovery`).
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
- **Editing windows:** attendance is editable only for the **next 3 upcoming fixtures**; stats lock **2 days**
  after a game (`STATS_FREEZE_DAYS`, cut from 5 on 2026-08-31) **for players — admins are exempt**
  (`isStatsEditable(game, { isAdmin })`); MOTM voting runs from estimated full-time (kickoff + 2h) to **5 days**
  later (`MOTM_VOTING_DAYS`, set on 2026-08-20 when it was 24h). Because a MotM win is only counted once voting
  closes, the winner surfaces 5 days after the match.
- **Roster thresholds:** ≤5 playing = "not enough", 6 = "just enough", ≥7 = "right amount"
  (`MIN_PLAYERS_WARNING`, `JUST_RIGHT_PLAYERS`), and **8 In = full** (`GAME_FULL_PLAYERS`) — see below.
- **A full fixture closes RSVP (2026-08-31).** At 8 In (roster + guests) attendance locks for that match,
  admins included: `isGameFull(playingCount)`. The one change still accepted is an In player stepping back
  (Out / If needed / Clear RSVP) — `isRsvpAllowedWhenFull(current, next)` — which frees the spot and reopens
  the match. First come, first served; there is no waiting list.
- **Goalkeepers are two separate flags (2026-08-31).** `players.is_goalkeeper` = "is a keeper" (admin panel),
  which drives the per-fixture *"do we have a goalie In?"* check; `player_stats.kept_goal` /
  `guest_players.kept_goal` = "went in goal in *this* match", ticked post-game and explicitly allowed for
  someone who is not a keeper. Logic in `src/utils/goalkeeper.js`; needs `supabase/player_goalkeeper.sql`.

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
  warnings on add. **Exception 2 — `*.mjs` is pinned to `text eol=lf`** (added 2026-08-24): with
  `core.autocrlf=true` a Windows checkout rewrites scripts to CRLF, and a **CRLF shebang line** makes
  esbuild/vitest reject the whole file with a bare `SyntaxError: Invalid or unexpected token` and no line
  number — while plain `node` runs it fine. Isolated precisely: an all-CRLF `sync-lzv.mjs` fails to import
  under vitest; the same file with *only* the shebang switched back to LF passes. The rule closes it, but if a
  script test ever fails to parse again, check line endings before reading the code. Ignore them. **Exception — `*.ics` is pinned to `-text` in `.gitattributes`** (added
  2026-08-17): RFC 5545 mandates CRLF and `gen-ics.mjs` emits it, but `core.autocrlf=true` was normalizing
  the feeds to LF on every Windows commit while the Linux CI runner stored CRLF — a whole-file churn on all
  three feeds each sync, and a real risk of shipping an LF feed that strict clients (Outlook) reject.
  **Don't remove that rule, and don't "fix" the .ics files to LF.**
- **The hall booking is a standing fortnightly series, not one slot per fixture.** The
  club books every second Thursday 21:00–22:00 at Sporthal Winketkaai for the whole
  season (AGB SAM, 16 slots in 26-27); LZV then lands only ~11 home games on it. So
  "reserved but no fixture" is normal, not a scheduling bug. Also: **two 26-27 fixtures
  are AT Winketkaai while we are the away side** (Sun 06/09/2026 vs VT 09, Sat
  24/04/2027 vs FC Tripel) — those opponents use the same hall, so they are their
  bookings, not ours. Don't "fix" the home/away flag on those two.
- **`file:` there is none** — single package, plain npm. No monorepo/workspaces.
- **Web fonts** come from Google Fonts (`index.html`); offline they fall back to a system sans — fine, just less
  distinctive. **Header is static** (scrolls away) by the user's choice — not sticky/fixed.
- **No component uses `React.memo`.** So memoizing callbacks in `useFutsalData` buys nothing on its own — don't
  add `useCallback` there expecting a win without also memoizing the heavy children (profile first).

## Current state (as of 2026-08-31)
- 🟡 **ADD `https://caracrew.org` TO Supabase Auth → URL Configuration → Redirect URLs.**
  Checked 2026-08-25, and the apex — the host this app actually runs on — is **not on the
  allowlist**. It currently holds `https://www.caracrew.org/**` (the **www** host) and
  `http://localhost:3000`. Reset still works today only by accident: an unallowlisted
  `redirectTo` is silently dropped and Supabase falls back to **Site URL**, which happens to
  be `https://caracrew.org`. That is one dashboard edit away from breaking, and the failure
  mode is invisible — the mail sends, the link just lands somewhere useless.
  Two details that decide which entries are needed:
  - **The app always sends a bare origin, never a path** (`getAuthEmailRedirectTo` returns
    `normalizeSiteUrl(window.location.origin)`, trailing slash stripped). So a `…/**` entry is
    not the form that has to match — whether Supabase's glob lets `/**` match a path-less URL
    is exactly the question worth not depending on. Add the **bare** `https://caracrew.org`.
  - Setting **`VITE_SITE_URL=https://caracrew.org`** in the production build makes `redirectTo`
    deterministic instead of "whichever host the visitor happened to load".

- ✅ **CLOSED 2026-08-31 — `supabase/player_goalkeeper.sql` has been run.** Verified against the live
  DB before pushing: `players.is_goalkeeper`, `player_stats.kept_goal` and `guest_players.kept_goal`
  all select, and `rpc/admin_update_player` resolves the 4-argument named call (returns the
  function's own *"Not authorised"* for an anon caller, which is the guard firing, not a missing
  signature). The push was deliberately held until then: the stats upsert carries `kept_goal`, so
  shipping first would have broken every goals/assists save.

- 🟡 **RUN `supabase/bug_reports.sql` BEFORE THE NEXT DEPLOY.** The new "Report a bug"
  button inserts into a table that does not exist yet; until the migration is run the
  button fails and the reporter sees the Postgres error. The admin panel's Bugs tab
  degrades on purpose (its own inline error, the other tabs keep working), but the
  button does not. Committed but **not pushed** for exactly this reason — push after
  the SQL is in.

- ✅ **CLOSED 2026-08-20 — the digest's sender was already configured.** The 🔴 in the
  2026-08-19 log below is stale: `DIGEST_FROM_EMAIL` is set to
  `weeklydigest@caracrew.org`, and all three Resend DNS records for caracrew.org
  resolve (DKIM at `resend._domainkey`, SPF + `feedback-smtp.eu-west-1.amazonses.com`
  MX on `send.caracrew.org`). A dry run resolved **11 recipients** from 11 auth users /
  13 player rows, correctly excluding the two unlinked players (Bart Moyens, Cédric
  Vaessen) and deduping `DIGEST_TO_EMAIL` against the roster-derived address.
  `DIGEST_TO_EMAIL` is now redundant and can be emptied.
  **⚠ Still unproven: Resend's domain verification status.** `DIGEST_DRY_RUN` returns
  *before* Resend is touched (`send-weekly-digest.mjs:468`), so nothing has yet
  exercised that sender. If the domain is not Verified, all 11 sends 403 and the job
  fails. Check Resend → Domains, or wait for the Friday 16:00 UTC run — 2026-08-21 was
  the first scheduled run of the roster-driven code (`c868e8a`); every green run before
  it was the old single-recipient version.

- ✅ **CLOSED 2026-08-19 — the anon-write / admin-takeover hole is fixed and verified.**
  `supabase/fix_rls_lockdown.sql` was run. Re-probed from outside with the public anon key
  afterwards: every insert refused (401) across games/players/attendance/player_stats/motm_votes/
  guest_players/opponent_strength, and — the checks that actually matter, because an RLS-blocked
  UPDATE returns a misleading **204 with zero rows affected** rather than an error — **promoting a
  non-admin to `is_admin` left the flag `false`**, a fixture delete was a no-op (21 still there),
  an `auth_user_id` hijack left the column null, and a score write left it null. Admin count is 1.
  Public reads still return 200 on all seven tables. The probe's junk rows are gone (13 players).
  **⚠ When reading this back, remember 204 does not mean blocked and 204 does not mean applied —
  always re-read the row.** An earlier probe of mine targeted a player who was *already* admin,
  which proved nothing; the conclusive test is promoting a **non**-admin and re-reading.
  **What made this findable:** probing the live API per-table, per-verb. The migration files
  described a correct model all along — the live database had drifted from them, so no amount of
  reading `supabase/*.sql` would have shown it.

- ✅ **CLOSED 2026-08-20 — the inverted ZVC Tigers result is fixed and verified.**
  `supabase/fix_2526_tigers_score.sql` was run. Re-read from outside with the public anon key
  afterwards (reads are public, so this needs no service role): the row
  `2526-2025-10-14-2100-zvc-tigers` now stores **1-10** (our goals / theirs) against the title
  `ZVC Tigers 10 - 1 K Caracrew SK`, and the 25-26 record recomputes to **4W-2D-16L / 65-136 /
  14 pts** — exactly the numbers predicted before the fix, which is what makes it a verification
  rather than a hope. Was 5W-2D-15L / 74-127 / 17 pts.
  **What made it findable:** auditing all 22 rows against their own titles. 20 of 21 parseable
  titles agreed with their stored scores; the decisive analogue was
  `VV Schemerboyz 2 - 11 K Caracrew SK` stored `11-2` — same shape (we are away, named second,
  our goals on the right) read correctly, while the Tigers row had taken the *left* number.

## Fixed in the review (all committed, gates green: lint, 80 tests, build)
- 🐛 **MOTM voting opened at midnight, not after the match.** `isMotmVotingOpen` was gated on
  `isPlayed()`, which is day-granular (`game_date < today`), so the window stayed shut until 00:00.
  A 21:00 home game lost its 23:00–00:00 hour; the 26-27 calendar's 18:00/19:00/19:30/20:00 away
  kickoffs would have lost **2–4 hours each** — the hours right after the whistle, when people
  actually vote. The gate was pure subtraction: `nowMs >= openAt` (kickoff + 2h) already implies the
  game kicked off. Removed from `isMotmVotingOpen` and `countPlayerMotmWins`, which also makes the
  injected `nowMs` honoured throughout so the window is finally testable. 5 regression tests.
- 🐛 **A fresh season rendered as a wall of red.** With no RSVPs, every fixture showed
  `readinessClass(0)` → red "Not enough players", and the panel said "only 0 marked In" — alarming
  and untrue, since nobody had been asked. `readinessClass`/`playerStatusLabel` now take an optional
  `responses` count and report a neutral **"No responses yet"** at zero; the low-count warning box
  only fires once somebody has answered. Thresholds are unchanged once responses exist, and a game
  where everyone answered "Out" still goes red. 4 tests.
- **`saveStat` had no time-window guard** — it checked ownership but not the freeze, unlike
  `saveAttendance`. `StatsTab` already disables the inputs (the freeze is absolute, admins included),
  so this only closed the UI/write gap.
- **Claim cancellation failed silently** — the one write with no toast. Now matches the rest.
- **`npm audit`: 4 dev-only vulnerabilities → 0.** Transitive (postcss, nanoid, brace-expansion,
  @babel/core), fixed semver-compatibly; vite 8 / vitest 4 majors deliberately unchanged.
  Production dependencies were already clean.

## Reviewed and found sound (don't re-audit)
- **RLS *intent* is right** — the model in `auth_ownership.sql` is correct; the live DB had drifted
  from it. `motm_votes` has `unique (game_id, voter_key)`, so one vote per user per game is enforced
  in the schema, not just the UI. `players_auth_user_id_unique` prevents one account linking to two
  players.
- **The stats page survives the new season's exact shape** — probed every util with 21 fixtures,
  all scores null, no stats/attendance: all return zeroed/empty structures, none throw.
- **The claim/onboarding flow** handles all four banner states and correctly offers only unclaimed
  players, with a sensible empty state. Note only **2 of 13** roster rows are currently unclaimed
  (Cédric Vaessen, Bart Moyens) — anyone new needs an admin to add their row first.
- **Known and accepted, not bugs:** attendance/stats time windows are UI-only (RLS scopes writes to
  your own row but not to a window) — fine for a team app; `gameStatusById` is O(games x attendance),
  trivial at this scale.

## Superseded — state as of earlier on 2026-08-19
- ✅ **The official 26-27 calendar is LOADED AND VERIFIED.** LZV published on/before 2026-08-19; the user ran
  `supabase/fixtures_2627.sql` in the SQL editor the same day. Verified read-only afterwards: **21 rows**,
  every `id` consistent with its own date/time/opponent, no duplicate ids or `(date, opponent)` pairs, no
  null `game_time`/`location`, every `title` carries the team, all scores still null, 11 opponents, span
  2026-09-06 → 2027-05-09, **2526 untouched at 22**, and no child-table rows point at 2627 yet.
  `.ics` feeds regenerated (21 VEVENTs, CRLF intact) and committed.
- ✅ **Resolved 2026-08-19 — and the original note was wrong.** `weekly-digest.yml` now passes
  `${{ vars.LZV_SEASON_SLUG || '2627' }}`, matching the other workflows. The claim that the digest
  "misbehaves without it" never held: the *script* already fell back
  (`process.env.DIGEST_SEASON_SLUG || DEFAULT_SEASON_SLUG` → `2627`), so an **unset** var was harmless.
  The real risk was the inverse — the var still being set to `2526` would silently digest last season
  with no error anywhere. Setting the repo var explicitly is still the tidier state; it is no longer a 🔴.
- 🔴 **RUN `supabase/opponent_strength_played.sql` BEFORE THE NEXT PALMARES SYNC (cron: 1 Sept
  06:30 UTC).** `sync-palmares.mjs` now writes a `current_played` column that does not exist yet.
  Until the migration runs, every upsert fails with "column does not exist" and the job logs errors
  and updates nothing. It fails *safely* — no bad data is written — but it does nothing useful either.
- ✅ **The palmares difficulty problem is fixed in code (2026-08-19).** LZV publishes the full
  12-team table from day one with **every team on 0 played / 0 points** — verified against the live
  page, all 12 parse as `played = 0`. The ordering is arbitrary, so rating from it produced
  confident nonsense: Knallende Knapen (relegated 12th of 4e Klasse last season) read **"Very
  hard"**, Bankzitters United (brand new, no history at all) read **"Very easy"**.
  `current_ptn_per_match` could not detect this — 0 means both "no games" and "lost them all" — so
  the fix persists the standings' `played` count and gates on it:
  `null` = unknown, trust as before (every 25-26 row, so nothing regresses); `0` = season not
  started, show **no rating at all**; `>0` = rate normally. `computeStrengthScore` also skips the
  current season at 0 played, which otherwise contributed a 0 component at weight 0.55 and
  flattened every opponent's score. 9 tests, including the real 26-27 table.
  **Net effect: the difficulty chip is simply hidden until results exist, and returns by itself
  after the first round** — no need to block the cron or remember to undo anything.

## Fixed in the review (all committed, gates green: lint, 80 tests, build)
- 🐛 **MOTM voting opened at midnight, not after the match.** `isMotmVotingOpen` was gated on
  `isPlayed()`, which is day-granular (`game_date < today`), so the window stayed shut until 00:00.
  A 21:00 home game lost its 23:00–00:00 hour; the 26-27 calendar's 18:00/19:00/19:30/20:00 away
  kickoffs would have lost **2–4 hours each** — the hours right after the whistle, when people
  actually vote. The gate was pure subtraction: `nowMs >= openAt` (kickoff + 2h) already implies the
  game kicked off. Removed from `isMotmVotingOpen` and `countPlayerMotmWins`, which also makes the
  injected `nowMs` honoured throughout so the window is finally testable. 5 regression tests.
- 🐛 **A fresh season rendered as a wall of red.** With no RSVPs, every fixture showed
  `readinessClass(0)` → red "Not enough players", and the panel said "only 0 marked In" — alarming
  and untrue, since nobody had been asked. `readinessClass`/`playerStatusLabel` now take an optional
  `responses` count and report a neutral **"No responses yet"** at zero; the low-count warning box
  only fires once somebody has answered. Thresholds are unchanged once responses exist, and a game
  where everyone answered "Out" still goes red. 4 tests.
- **`saveStat` had no time-window guard** — it checked ownership but not the freeze, unlike
  `saveAttendance`. `StatsTab` already disables the inputs (the freeze is absolute, admins included),
  so this only closed the UI/write gap.
- **Claim cancellation failed silently** — the one write with no toast. Now matches the rest.
- **`npm audit`: 4 dev-only vulnerabilities → 0.** Transitive (postcss, nanoid, brace-expansion,
  @babel/core), fixed semver-compatibly; vite 8 / vitest 4 majors deliberately unchanged.
  Production dependencies were already clean.

## Reviewed and found sound (don't re-audit)
- **RLS *intent* is right** — the model in `auth_ownership.sql` is correct; the live DB had drifted
  from it. `motm_votes` has `unique (game_id, voter_key)`, so one vote per user per game is enforced
  in the schema, not just the UI. `players_auth_user_id_unique` prevents one account linking to two
  players.
- **The stats page survives the new season's exact shape** — probed every util with 21 fixtures,
  all scores null, no stats/attendance: all return zeroed/empty structures, none throw.
- **The claim/onboarding flow** handles all four banner states and correctly offers only unclaimed
  players, with a sensible empty state. Note only **2 of 13** roster rows are currently unclaimed
  (Cédric Vaessen, Bart Moyens) — anyone new needs an admin to add their row first.
- **Known and accepted, not bugs:** attendance/stats time windows are UI-only (RLS scopes writes to
  your own row but not to a window) — fine for a team app; `gameStatusById` is O(games x attendance),
  trivial at this scale.

## Superseded — state as of earlier on 2026-08-19
- ✅ **The official 26-27 calendar is LOADED AND VERIFIED.** LZV published on/before 2026-08-19; the user ran
  `supabase/fixtures_2627.sql` in the SQL editor the same day. Verified read-only afterwards: **21 rows**,
  every `id` consistent with its own date/time/opponent, no duplicate ids or `(date, opponent)` pairs, no
  null `game_time`/`location`, every `title` carries the team, all scores still null, 11 opponents, span
  2026-09-06 → 2027-05-09, **2526 untouched at 22**, and no child-table rows point at 2627 yet.
  `.ics` feeds regenerated (21 VEVENTs, CRLF intact) and committed.
- ✅ **Resolved 2026-08-19 — and the original note was wrong.** `weekly-digest.yml` now passes
  `${{ vars.LZV_SEASON_SLUG || '2627' }}`, matching the other workflows. The claim that the digest
  "misbehaves without it" never held: the *script* already fell back
  (`process.env.DIGEST_SEASON_SLUG || DEFAULT_SEASON_SLUG` → `2627`), so an **unset** var was harmless.
  The real risk was the inverse — the var still being set to `2526` would silently digest last season
  with no error anywhere. Setting the repo var explicitly is still the tidier state; it is no longer a 🔴.
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
- **2026-09-02** — *Venues link to Google Maps; List/Calendar is a real toggle.*
  - **Venue → Google Maps.** `src/data/venues.js` maps each `games.location` string to a street
    address, transcribed from the region's own hall list (https://www.lzvcup.be/sportshalls/11,
    the same street/city pairs its "Route" buttons use). **De Nekker is not on that page** — it is
    a provincial centre, address from denekker.be — and it is our most-used venue (16 fixtures),
    so it is worth knowing the table is not purely LZV-derived. All 7 venues currently in the DB
    resolve to a real address.
  - `utils/venue.js` builds `https://www.google.com/maps/search/?api=1&query=<street, city, Belgium>`
    — the **search** endpoint, not `maps/dir/` like LZV's Route button: clicking a venue should show
    you where it is, not start navigating. An unlisted hall falls back to its own name + Belgium,
    so a new venue still links usefully; the table is an accuracy upgrade, not a gate.
  - **Where it renders:** `SelectedGamePanel`'s meta line and the `MyNextGamesTiles` tiles, via
    `components/VenueLink.jsx`. **Not** the sidebar fixture rows, the "next fixtures" list or the
    calendar cells — those are all `<button>`s, and an `<a>` inside a `<button>` is invalid HTML.
    The linked copy is on the panel the row opens. If the sidebar ever needs it, the row has to stop
    being a button first.
  - `formatFixtureTileLine` was split into `fixtureTileParts(game)` → `{ when, venue }` so the tile
    can render the venue as a link; the old function now composes from it and is unchanged for
    callers.
  - **List/Calendar toggle.** Was one dark pill labelled with the view you were *not* in
    ("Calendar" while in list mode) — equally readable as a state label. Now a two-segment
    `.view-toggle` showing both options, the selected one lifted out in white and the other muted,
    in the same idiom as `.filter-status-row`. `aria-expanded` → `aria-pressed` per segment, which
    is what a view switch is. `.calendar-toggle-button` is gone (renamed, incl. its focus rule).
  - **The venue link carries Google Maps' own navigate arrow** (inline SVG in `VenueLink`, sized in
    `em` so it tracks the 13px panel line and the 11px tile line). The anchor stays `display: inline`
    on purpose — `inline-flex` stopped a long hall name from wrapping inside the narrow tile.
  - **Fixture rows now read `Sun 06-09-26 · 21:00`.** The list view was rendering raw DB values
    (`2026-09-06 · 21:00:00`: ISO date, seconds and all) while the calendar view used
    `formatMatchShortDate`; both now go through one `formatFixtureRowDateTime(game)`, which adds the
    abbreviated weekday, trims the Postgres `time` to `HH:MM` and shows `--:--` for a fixture with no
    kick-off. Weekday comes off the ISO prefix, not `Date` math, so no timezone can shift it.
    `formatMatchShortDate` stays as the DD-MM-YY primitive. 4 tests.
  - Still raw ISO, deliberately out of scope: the **match panel** meta line
    (`SelectedGamePanel`, `{game_date} · {game_time}`) and the dashboard tiles, which use
    `formatMatchCalendarDateTime` ("Sun, 6 Sept 2026"). Worth unifying if it starts to grate.
  - Verified: `lint` clean, `test` 261 passing (19 files, new `utils/venue.test.js`), `build` clean.
    **Not eyeballed in a browser** — worth a look at the toolbar, where the toggle now sits next to
    the Subscribe pill.

- **2026-09-01** — *Admin panel: player rows no longer overflow.*
  - The Players tab rows were a single non-wrapping flex line with `.admin-player-actions { flex-shrink: 0 }`.
    Six buttons plus the account `<select>` are wider than the 720px `.admin-panel`, so the name column was
    crushed to ~70px (names wrapping onto two lines, the role pill colliding with the buttons) and the rest
    spilled out as a horizontal scrollbar on the modal.
  - `.admin-claim-row` / `.admin-player-row` now `flex-wrap: wrap`, the meta column is `flex: 1 1 200px`, and
    the action strip wraps (`margin-left: auto` instead of `flex-shrink: 0`). Wide enough → still one row;
    too narrow → the buttons drop to their own line under the name instead of overflowing. The ≤640px rule
    that stacks the row keeps working; it just drops the auto margin.
  - CSS only — `lint`, `build` and `test` (248) all clean. **Not eyeballed by Claude** (no browser tooling
    here): worth a look at the Claims tab too, which shares the same two rules.
- **2026-08-31** — *Stats window cut to 2 days, admins exempt; goalkeepers.*
  - **`STATS_FREEZE_DAYS` 5 → 2**, and the freeze is no longer absolute: `isStatsEditable` took an options
    object (`{ nowMs, isAdmin }`) and returns true for an admin however old the game is. Everyone is still
    blocked on a game that has not been played — there is nothing to record. Enforced in `saveStat`
    (`{ isAdmin }`) as well as in `StatsTab` (`isAdmin: canManageGame`), which now shows players *"ask an
    admin"* and admins *"locked for players, but you can still edit"*. `saveGuestStat` was already admin-only
    with no window check, so it needed nothing.
  - **Second param of `isStatsEditable` changed shape** (was a positional `nowMs`). Nothing passed it — the
    only callers used the default — so this is safe, but a future caller must use `{ nowMs }`.
  - **Goalkeepers, as two deliberately separate flags.** The roster flag `players.is_goalkeeper` answers
    "is this player a keeper" and drives the per-fixture check; the per-game `player_stats.kept_goal` /
    `guest_players.kept_goal` records who *actually* went in goal, which the user explicitly wants to be
    settable for a non-keeper. Conflating them would have made one of the two questions unanswerable.
  - **The check runs for every fixture, not just the selected one:** `gameStatusById` gained
    `keeperIn` / `keeperMissing` / `keeperUnknown`, so the sidebar shows a `No GK` chip, there is a new
    **No goalkeeper** filter (conflicts with `played` — only an upcoming match can be short a keeper), the
    match panel gets a red *No goalkeeper In* line, and the Friday digest a warning. `keeperUnknown`
    (nobody flagged at all) keeps all of it silent: that is an unset flag, not a missing goalie.
  - A keeper who plays as a **guest** still counts — the guest row's `source_player_id` is matched against
    the keeper ids, not just `attendance.player_id`.
  - **Admin panel:** `→ Keeper` / `Not keeper` button + a `Keeper` pill, via
    `admin_update_player(..., goalkeeper_arg)`. The migration **drops and recreates** that function rather
    than `create or replace` — adding a parameter leaves two overloads, and PostgREST refuses to choose
    between them for a named-argument call.
  - **`supabase/player_goalkeeper.sql` must be run before this ships.** Until then the roster toggle errors
    (unknown argument) and the Keeper tick fails on insert; the read path degrades quietly, because
    `is_goalkeeper` is normalised to `isGoalkeeper: !!player.is_goalkeeper` in `playersWithRole` and a missing
    column is simply `undefined`.
  - Verified: `lint` clean, `test` 248 passing (18 files, new `utils/goalkeeper.test.js`), `build` clean,
    and the three new columns + the 4-argument RPC confirmed against the live DB over PostgREST before
    pushing. **Not eyeballed in a browser.**

- **2026-08-31** — *A match with 8 players In is full: RSVP closes.*
  - **The rule.** `GAME_FULL_PLAYERS = 8` (`src/constants.js`) + `isGameFull(playingCount)` and
    `isRsvpAllowedWhenFull(currentStatus, nextStatus)` (`src/utils/game.js`). `playingCount` is the same
    roster+guest "In" total the sidebar and summary already show (`gameStatusById[id].playingCount` /
    `counts.playing`). No new season or per-game config — 8 is a squad rule, not a fixture attribute.
  - **The one exception, and why it is not optional.** A hard lock at 8 would freeze the headcount: a player
    who then can't make it could not record it, the match would keep looking full, and nobody could take the
    freed spot. So a player who is already **In** may still switch to **Out** / **If needed** / clear their
    answer; every other transition (a late In, Out→If needed, clearing an Out) is blocked. Dropping to 7
    reopens the match for everyone. First come, first served — deliberately no waiting list.
  - **Applies to admins and guests too.** Consistent with the other RSVP locks (preview season, played,
    outside the next-3 window), none of which admins can override. Enforced in the writes
    (`useFutsalData`: `saveAttendance`, `saveGuestAttendance`, and `addGuestPlayer` — a new guest is inserted
    as `playing`, so it would push past 8), not only in the disabled buttons.
  - **UI:** green `.full-box` on `SelectedGamePanel` ("Match full — 8 players In"), an `info-banner` +
    per-option disabling in `AttendanceTab`, a "Full — 8 In, RSVP closed" line on the `MyNextGamesTiles`
    tiles (shown only to someone *not* In, which is both who needs it and what keeps the reserved footer at
    two lines so tiles stay aligned), and `playerStatusLabel` now returns **"Full — RSVP closed"** at ≥8
    in the sidebar (`readinessClass` stays `success` — full is good news).
  - **Two nudges had to follow the rule, or they'd chase people to press a disabled button:** the Friday
    digest now prints *"Full — n In. RSVP is closed"* instead of listing non-responders (and had to start
    fetching `guest_players`, which it never did, or a full fixture still looked short-handed), and the
    admin **Nudge missing** button hides once full.
  - **The guide follows automatically** — `GuideModal` reads `GAME_FULL_PLAYERS`, gained a first-come-
    first-served paragraph, a fourth "Full — RSVP closed" step in the headcount scale (`.guide-scale--four`,
    two columns under 560px), and the deadlines table now closes RSVP at *"end of match day — or as soon as
    8 are In, whichever comes first"*.
  - Verified: `lint` clean, `test` 240 passing (17 files), `build` clean. **Not eyeballed in a browser** (no
    browser automation here) — worth a look at a fixture with 8 In.

- **2026-08-25** — *Password reset, which the app never had.*
  - **There was no recovery path at all.** `useAuthSession` had `signIn` / `signUp` / `signOut` and
    nothing else, and `AuthModal` had no "forgot" link — a player who lost their password could only
    be fixed by an admin editing them in the Supabase dashboard. The tell that this was an omission
    rather than a decision: `utils/authErrors.js` already mapped the rate-limit error to copy
    mentioning "account or **reset** emails", for reset emails nothing could send.
  - **`requestPasswordReset(email)`** → `resetPasswordForEmail`. The success message is the same for
    an unknown address as for a real one (*"if an account exists for …"*) — a per-address yes/no would
    let anyone enumerate which emails are on this roster.
  - **`updatePassword(password)`** → `updateUser`, plus `recovery: { active, error }` and
    `dismissRecovery()`. New `components/NewPasswordModal.jsx` is the set-new-password step
    (twice-entered, 6-char floor, keeps the session on success).
  - **Recovery is detected two ways on purpose**: the `PASSWORD_RECOVERY` auth event *and*
    `readRecoveryFromUrl(hash, search)` read at mount. The client parses the recovery fragment while
    it initialises, which can beat our `onAuthStateChange` listener — relying on the event alone
    leaves the user signed in with no form and no explanation. Pure and unit-tested in
    `utils/authRedirect.test.js` (which also backfills coverage for `normalizeSiteUrl`).
  - An **error** fragment (`error_code=otp_expired`) is explicitly *not* treated as a recovery: it
    carries no session, so it reopens the auth modal on the reset form with the reason instead of
    showing a form that cannot submit. The `#access_token=…` fragment is stripped via
    `history.replaceState` once consumed, so a refresh does not re-enter the flow.
  - **Both modals are conditionally mounted by `App` rather than self-hiding on an `open` prop**, so
    each open starts from clean state. The obvious version — an effect that re-seeds state when
    `open` flips — is exactly what `react-hooks/set-state-in-effect` rejects, and lint must stay
    clean. Same reason `authModalVisible` is derived (`authModalOpen || !!recovery.error`) instead of
    mirrored into state, and why `dismissRecovery` returns the previous object when there is nothing
    to clear so it can be fired on every close.
  - Caveat worth repeating to users: the link must be opened **on the device that will set the
    password** (the session rides the URL), it is single-use, and it lapses after ~an hour.
  - **The dev server was on :5173, not the :3000 that README/HANDOVER have always claimed** —
    `vite.config.js` never pinned `server.port`, so it sat on Vite's default and the docs were
    simply wrong. Harmless until now; with reset in play it means the allowlisted
    `http://localhost:3000` never matches, so a local tester's reset link falls back to Site URL
    and walks them into **production**. Pinned to 3000 with `strictPort: true` — silently
    drifting to :3001 would resurrect the same bug.
  - Verified: `lint` clean, `test` 236 passing (17 files), `build` clean, dev server confirmed
    listening on :3000. **Not eyeballed in a browser** — no browser automation here, and the flow
    needs a real Supabase email round-trip. Worth one manual run-through on the live site once
    the apex is on the redirect allowlist.

- **2026-08-24** — *Two data-integrity guards: scores checked against their titles, reschedules detected.*
  - **Admin panel → Data: every stored score cross-checked against its fixture `title`.** New pure util
    `utils/scoreAudit.js` (`parseScoreFromTitle`, `auditGameScore`, `auditGameScores`,
    `suggestedScoreFix`). The title is a **second, independent record of the same result**, so the
    2025-10-14 ZVC Tigers inversion (stored `10-1`, title `ZVC Tigers 10 - 1 K Caracrew SK`) was
    detectable from day one — it took a hand-audit of all 22 rows to find. This runs that audit on
    every panel load, **across all seasons**, because the bad row was in a season the app had already
    stopped defaulting to.
  - Four verdicts, ranked: **inverted** (swapping matches the title — offers copyable `update` SQL),
    **mismatch** (a human decides), **missing** (title has a result the row never stored — the sync
    missed it), **unverified** (score stored, title carries none). Unplayed fixtures return nothing.
  - **Verified against the real data, not just invented cases:** all 21 scored 25-26 titles from
    `public/fixtures-2526.ics` are in the test file with their expected our-goals-first values, plus
    the actual Tigers row in both its broken and fixed states. The parser also handles `04United`
    (name starts with digits), `VT 09` (number inside the name), both `K Caracrew SK` / `K. Caracrew
    SK` spellings, en/em dashes, and the one real unparseable title
    (`K Caracrew SK - Futsal Opsinjoor` → *unverified*, not a false alarm). A draw is never reported
    as inverted.
  - **`sync-lzv.mjs` now detects reschedules.** It only ever matched on an **exact date**, so a moved
    fixture was two silent non-events at once: LZV's result found no row to write to, and the stored
    row stayed empty forever. New pure `reconcileFixtures` reports **possible reschedule** (result
    with no same-date row, but an unclaimed row against that opponent elsewhere), **unmatched result**,
    and **stale fixture** (>`STALE_RESULT_DAYS` = 7 days past, unscored, never reported by LZV).
  - **Fixtures matched on their own date are claimed first**, so the second leg of a double
    round-robin can't be mistaken for the first. Candidates sort unscored-before-scored, then by date
    distance; two remaining candidates are both listed rather than guessed between.
  - **It never moves a date and never re-imports** — the id encodes the old date and every RSVP/stat/
    vote FKs to `game_id`. It prints the `update games set game_date = …` for the *existing* row.
    Findings go out as GitHub Actions `::warning::` annotations so they land in the run summary.
  - Smoke-tested against the **real 21-fixture 26-27 list** (parsed from `public/fixtures-2627.ics`)
    with the 2026-11-08 VV Schemerboyz away game moved to 11-15: 5 matched, exactly **1** reschedule
    candidate offered (not 2, despite Schemerboyz appearing twice — the 09-24 row was already
    claimed), 0 orphans, 0 false stale.
  - 🐛 **Found and fixed on the way: a CRLF shebang breaks vitest.** Writing `scripts/*.mjs` with a
    tool that emits CRLF makes esbuild reject the whole file with a bare `SyntaxError: Invalid or
    unexpected token` (no line number), while plain `node` imports it fine — it cost a bisect. The
    cause was isolated exactly (all-CRLF fails; same file with only the shebang line LF passes), and
    `.gitattributes` now pins `*.mjs` to `text eol=lf` so a Windows checkout cannot reintroduce it.
  - README: new **Score sync and reschedules** section, the admin panel is now documented as **five**
    tabs (it already had Bugs and said three), and the Data tab has its own subsection.
  - Verified: `lint` clean, **229/229** (+67), `build` OK. AdminPanel chunk 15.3 → 19.7 kB, code-split
    so the initial bundle is unchanged. **Not eyeballed** — no browser automation here; the Data tab
    is worth a look in `npm run dev`.
- **2026-08-24** — *Attendance tab groups players by RSVP status.*
  - `AttendanceTab` no longer renders one flat 2-column grid of every player. Once **at least one
    player has answered**, the tab splits into sections — **In · If needed · Out · No response** — each
    with a tinted heading and a count chip, and each holding its own `player-grid`. The point is to
    make "who is still missing" and "who is in" readable at a glance on a fixture with 15+ names,
    which the flat list buried.
  - New pure util `utils/attendanceGroups.js` (`groupPlayersByAttendance`, `hasAnyAttendanceVote`,
    `attendanceGroupLabel`) holds the bucketing so it stays testable and the component stays a view.
    Group **order is fixed** (`ATTENDANCE_GROUP_ORDER`) rather than derived from `ATTENDANCE_OPTIONS`,
    which is ordered `playing / cant / if_needed` for the buttons — a different, deliberate order.
    Labels are reused from `attendanceLabel` so headings and buttons cannot drift apart.
  - **Grouping is skipped when nobody has voted yet** (`hasAnyAttendanceVote`): every player would
    land in "No response" and the heading would be pure noise on a fresh fixture.
  - Empty groups are dropped; an unrecognised status still gets its own group rather than making the
    player disappear from the tab.
  - Card markup, editing rules, tooltips and the guest card are **unchanged** — the card render moved
    into a `renderPlayerCard` helper, nothing else. `current` now reads through the same `statusOf`
    the grouping uses, so a card and its group can't disagree.
  - CSS: `.attendance-group*` block next to `.player-grid` in `index.css`, tones from the existing
    `--tone-success/warning/danger-*` pairs (no new hex).
  - Verified: `lint` clean, **162/162** (+9), `build` OK. **Not eyeballed** — no browser automation
    here; the visual split is worth a quick look in `npm run dev`.
- **2026-08-20** — *Share message cleaned up; the nudge tally now reconciles.*
  - **Why the old nudge tally read as nonsense:** `In / If needed / Out` came from `counts.*`, which
    **includes guests**, while `No reply` was **fixed-players-only** and the squad line printed the
    fixed-roster size. So `… No reply 6` next to `12 in the roster` could not be added up, and the
    figure did not have to match the names listed underneath. `counts` now also exposes a
    `roster` / `guestBreakdown` split (additive — the summary bar still uses the mixed totals), the
    nudge prints **`*Roster (12)* · In 4 · If needed 2 · Out 3 · No reply 3`** (adds to 12) with guests
    on their own line, and **`No reply` is derived from the name list itself**, so count and list
    cannot disagree.
  - **Share message got the same treatment.** `formatFixtureShareLines` is now the one place that
    formats a fixture for sharing: bold title, `formatMatchCalendarDateTime` + venue, and a
    `Final score x – y` line when the fixture has one (sharing a played match is usually *about* the
    score). It fixes two real defects — the raw `game_date` (an ISO datetime shared verbatim) and
    `game_time` with its seconds (`21:00:00`), plus the dangling `·  ·` a missing time/venue left
    behind, since `.trim()` cannot remove a separator in the middle.
  - `handleShare`'s **native share sheet** now uses the same body (`formatFixtureShareText`), so a
    fixture reads identically whether it goes out via WhatsApp, the OS sheet or the clipboard.
  - Still raw in the **UI**, deliberately out of scope here: the `<p>` under the match header in
    `SelectedGamePanel` prints `game_date · game_time · location` unformatted (`2026-09-08 ·
    21:00:00`). Same defect class, one line to fix, needs an eyeball.
  - Verified: `lint` clean, **153/153** (+12), `build` OK. **Not eyeballed** — no browser automation
    here. Committed and pushed to `main` (standing arrangement for this repo as of today).
- **2026-08-20** — *WhatsApp nudge message rewritten.*
  - `buildWhatsAppNudgeUrl` (`utils/formatMatch.js`) now leads with the fixture in **WhatsApp bold**
    and — the actual bug — prints the **full date** (`formatMatchCalendarDateTime`) plus the venue
    instead of just `formatMatchDayTime`'s weekday+time. A nudge sent days ahead has to say *which*
    match; "Tuesday 21:00" doesn't.
  - Copy cleaned: consistent-case tally (`In / If needed / Out / No reply`), squad size on its own
    line, and the missing players read as a sentence (`Jan, Piet and Bram` via a small local
    `formatNameList`) rather than a CSV with a count in front of it.
  - "Attendance Bot 3000" moved from the headline to an italic **footer signature**. It still tells the
    group this is automated rather than someone singling players out, but it no longer takes the first
    line from the fixture.
  - Empty-safe: the when/where line, the guest count and the names line each drop out when there is
    nothing to put in them (so no `guests 0` or dangling label).
  - Verified: `lint` clean, **145/145** (+4, decoding the `wa.me` payload back to text), `build` OK.
    The one date assertion is a regex — `Intl` renders `Tue, 8 Sept 2026` on this ICU, and pinning
    the exact string would break on another. **Not eyeballed** — no browser automation here.
- **2026-08-20** — *The guide gets its own URL; Tigers fix verified.*
  - `?guide=1` opens the guide directly, so it can be shared without a Claude account or a login
    — `https://caracrew.org/?guide=1`. Follows the existing query-param routing (`openGuide` /
    `closeGuide` pushState like `openPlayer`/`closePlayer`), and **popstate moves the guide too**,
    so Back closes it instead of leaving the URL and the screen disagreeing.
  - The modal shows the link with a **Copy link** button. The URL is rebuilt from
    `origin + pathname`, **not** `href` — the live URL carries `?season=`/`?game=`/`?player=`
    state that has no business in a link to the guide. The link is always visible as text, so a
    refused `navigator.clipboard` costs nothing but the shortcut.
  - **Tigers fix verified applied** — see Current state above. `lint` clean, **141/141**, `build` OK.
- **2026-08-20** — *Stats and MotM windows both set to 5 days; the squad guide now lives in the app.*
  - **Stats freeze: 10 days → 5** (`STATS_FREEZE_DAYS`). **MotM voting: 24h → 5 days**
    (new `MOTM_VOTING_DAYS` in `utils/motm.js`; the end is still derived from the kickoff+2h open,
    so it can never precede the open).
  - **Knock-on worth knowing:** `countPlayerMotmWins` only counts a win once voting has *closed*,
    so the MotM winner now appears in the season stats **5 days** after the match instead of the
    next day. That is the same rule as before, not a new one — but the visible delay is 5x longer.
  - The old tests pinned the old windows: one asserted voting was shut two days after the match,
    which is now mid-window. Rewritten to derive their offsets from `MOTM_VOTING_DAYS` so the next
    change to the window cannot silently pass them, plus a new test that the in-between days are
    open. `StatsTab`'s hint text now interpolates the constant instead of saying "24 hours".
  - **New `GuideModal` ("How it works" in the header)** — a squad-facing guide inside the app:
    RSVP options, how to read the headcount, the two windows, a deadlines table, the calendar feed,
    and a pointer to Report a bug. Lazy-loaded, so the initial bundle only moved 466.17 → 466.52 kB.
  - **Every number in the guide is read from the constant that enforces it** — `STATS_FREEZE_DAYS`,
    `MOTM_VOTING_DAYS`, `MIN_PLAYERS_WARNING`/`JUST_RIGHT_PLAYERS`, `ATTENDANCE_OPTIONS` — and the
    .ics URL comes from `window.location.origin`. Change a window and the guide follows. **Don't
    hardcode a number in there.**
  - Why in-app rather than a shared document: a hosted page needed an account to open, and the squad
    should not need one to read how the app works. It is also the one copy that cannot go stale.
  - Account-creation steps deliberately **left out** of the guide at the user's request (most of the
    squad has signed up). Note 2 of 13 roster rows are still unlinked, so those two need a direct
    nudge rather than the guide.
  - `lint` clean, **141/141**, `build` OK. **Not eyeballed** — the visual check is on the user.
- **2026-08-20** — *In-app bug reporting; digest sender verified; hall booking reconciled.*
  - **"Report a bug" button** in the header (`dashboard-nav-btn-quiet` — deliberately the
    quietest thing up there). Open to signed-out visitors, because a bug that only
    logged-in players can report is a bug you hear about late.
  - **Table first, email second.** The client only inserts into `bug_reports`
    (`supabase/bug_reports.sql`); `scripts/send-bug-reports.mjs` mails new rows on a
    6-hourly cron (`.github/workflows/bug-reports.yml`) and stamps `emailed_at`. Chosen
    over an Edge Function because it **reuses the Resend setup that is already proven
    working** — no new tooling, no new secret, and no `supabase` CLI on this box. Cost:
    up to ~6 hours' delay. The row being the source of truth is the point: a broken
    mailer loses nothing, and reports are visible in **Admin panel → Bugs**.
  - **Not an optimistic write** — the one place in the app that deviates. Everywhere else
    the user can see whether their change landed; here they cannot, and "thanks, logged
    it" for a report that never arrived is worse than a spinner.
  - **RLS: anyone inserts, only admins read.** Reports carry email addresses, so a public
    `select` would hand them to anyone with the anon key. The insert policy also pins
    `auth_user_id` to `auth.uid()` (no filing under someone else's name) and forces the
    delivery columns to null/zero — otherwise a pre-stamped row would sit in the table
    forever, invisible to the mailer. Open insert is spammable; that trade-off is written
    into the migration's header rather than pretended away.
  - **The report body is hostile input** (anonymous insert), so the mail is HTML-escaped
    and there are tests that specifically try to inject markup into my own inbox.
  - **Client-side truncation mirrors the column caps**, because a 600-char user agent is
    entirely normal and Postgres rejects the whole insert, not just the long field —
    the reporter would have lost their text to a constraint error.
  - `email_attempts` caps retries at 5 so one unmailable report cannot fail every run
    forever; the job logs how many rows gave up. A send that succeeds but fails to stamp
    is logged as loudly as a failure — it *will* be re-sent next run.
  - Build timestamp is now stamped into the bundle (`vite.config.js` `define`) and
    attached to every report, so "which version were you on?" is answerable.
  - Verified: `lint` clean, **138/138** (+30), `build` OK. **Not eyeballed** — no browser
    automation here, so the visual check is on the user. **Committed, not pushed** until
    `supabase/bug_reports.sql` has been run (see Current state).
  - **Digest:** confirmed `DIGEST_FROM_EMAIL` was already set and a dry run resolves 11
    recipients correctly — details in Current state above. The old 🔴 was stale.
  - **Hall booking reconciled against the fixtures** (one-off, from the AGB SAM
    confirmation PDF + `supabase/fixtures_2627.sql`): **5 of 16 reserved slots have no
    home fixture** — 10/09/2026, 11/02/2027, 25/03/2027, 22/04/2027, 20/05/2027, €150 of
    the €480. All 11 home fixtures *are* covered, so there is no risk of arriving without
    a hall. Reservation number 648393 is missing from an otherwise contiguous run and
    lines up with 08/04/2027 (Easter break). A cancellation email was drafted for
    sport@mechelen.be. See the new gotcha above before reading anything into this.
- **2026-08-19** — *Digest recipients now come from the roster (`auth.users`), not a hand-edited var.*
  - **Before: the job had no idea who was in the squad.** Recipients were the repo variable
    `DIGEST_TO_EMAIL`, split on commas. `players` has no email column — addresses exist only in
    `auth.users` — so the list never tracked sign-ups, never dropped anyone, and was invisible from the repo.
  - **Now:** every non-archived `players` row whose `auth_user_id` points at a **confirmed** `auth.users`
    account. Read via `supabase.auth.admin.listUsers()` (paged) — PostgREST cannot select `auth.users`,
    which is why the **service-role key is mandatory**. `admin_list_auth_users()` is no use here: it gates
    on `is_admin_user()`, which reads `auth.uid()`, and a service-role call has no uid.
  - **Deliberate exclusions**, all named in the run log so "why didn't X get it" is answerable:
    unlinked players, unconfirmed/banned addresses, archived players, and **auth users not linked to any
    player** (that last one is what keeps a stray sign-up off the squad's mailing list).
  - **One mail per person instead of a shared `to:` array.** Auto-deriving the list turned the old
    all-recipients-visible `to:` into a real address leak. Sends are spaced ~600ms for Resend's ~2 req/s
    limit, a bad address fails alone, and the job exits non-zero if any send failed.
  - `DIGEST_TO_EMAIL` survives as **extra** recipients for people with no account; new `DIGEST_SKIP_EMAILS`
    is the opt-out; new `DIGEST_DRY_RUN` (also a `workflow_dispatch` boolean input) resolves and prints the
    list without sending. **Use the dry run before the first real send.**
  - 🔴 **Still blocking actual delivery: `DIGEST_FROM_EMAIL`.** The default `onboarding@resend.dev` only
    delivers to the Resend account owner's own address — everyone else 403s. Verify caracrew.org in Resend
    and set the var. The script now warns about this in the log when it sees a `resend.dev` sender and more
    than one recipient.
  - **Found a second latent bug while in there:** the script filtered the roster with `!p.archived`, but the
    DB column is `archived_at` — the boolean `archived` is *derived in the app*
    (`useFutsalData.jsx:180`), and this script reads raw rows. So the filter was always true and retired
    players were still being chased for RSVPs. Same trap as the `.env` outage: the missing consumer was
    invisible because the name looked right.
  - `selectRecipients()` is exported and pure so the who-gets-mail rules are unit-tested (10 cases,
    `scripts/send-weekly-digest.test.mjs`) — the job cannot be safely exercised from here, and this is the
    one decision in it with real blast radius. `vite.config.js` now includes `scripts/**/*.test.mjs`.
  - `weekly-digest.yml` also gained the `|| '2627'` season default, which closes the old 🔴 above.
  - `lint` clean, **108/108**, `build` OK. **Not run end-to-end** — no service-role key on this box.
- **2026-08-19** — *"Games played" counted RSVPs for fixtures that had not happened yet.*
  - 🔴 **Real data bug, user-reported:** the season-overview **GP** column counted every game with
    `attendance.status = 'playing'` regardless of date, so voting In for the next 3 fixtures read as
    *played 3*. `utils/teamSeasonStats.js` now requires `isPlayed(game)` too. An RSVP is an intention;
    an appearance is a fixture that took place.
  - **Had to move the denominator with it, or the fix creates a worse lie.** `pctPlayed` divided by the
    *whole schedule* (`games.length`), so once the numerator was played-only, a player who turned out for
    all 10 games that had happened would read **48% of 21**. It now divides by games played *so far*, and
    is `null` (rendered `—`) before anything is played — `0%` for everyone pre-season reads as "skipped
    every game". This also makes the live path agree with the static LZV-snapshot path, which was already
    dividing by a played-games total.
  - `totalSeasonGames` still means the full fixture count; the new `playedSeasonGames` is what GP and %
    are measured against. Caption now reads "N of 21 scheduled games played so far".
  - Goals/assists deliberately **not** filtered by `isPlayed` — no total changes, and a stats row can only
    exist for a fixture that has been playable. Note `isPlayed` is *strictly* before today, so a match
    played **today** joins GP tomorrow; that is the existing convention everywhere else.
  - **Same class of bug left alone deliberately:** `PlayerProfileModal`'s *In rate* and *Longest In streak*
    also span future fixtures, but they are labelled as RSVP intent ("In"), not appearances, so 3/3 is
    honest there. `currentStreak` already filters on `played`; `longestStreak` does not — worth a look if
    the streak numbers ever seem generous.
  - Calendar rows now show **DD-MM-YY** instead of `YYYY-MM-DD` (new `formatMatchShortDate` in
    `utils/formatMatch.js` — string slicing on the normalised date, no `Date`, so no timezone can shift
    the day). The **list-view** cards still show ISO on purpose — only the calendar chips were asked for.
  - New unit tests: `utils/teamSeasonStats.test.js` (4, fixtures dated relative to today since `isPlayed`
    reads the clock) and `utils/formatMatch.test.js` (5). `lint` clean, **98/98**, `build` OK.
- **2026-08-19** — *Sidebar now shows the actual headcount for fixtures that are open for RSVP.*
  - The sidebar only ever showed the *qualitative* readiness ("Just enough players") in list view, and
    **nothing at all** in calendar view — so you could see a fixture was thin but not by how much.
    Added `AttendanceCountChip` in `GameSidebar.jsx`: `7 in` (+ `+2 if needed`, compacted to `+2` in the
    calendar rows), with the full breakdown in the `title`.
  - **Gate is `!played && responses > 0`, not "the next 3 games".** Only the next 3 fixtures are open for
    RSVP (`isAttendanceEditable`), so having responses *is* the next-3 condition — deriving it keeps the
    chip correct if that window ever changes, and keeps later fixtures from rendering a meaningless `0 in`.
  - Chip is tinted `--accent-muted`/`--accent-strong`, deliberately **not** a tone colour: the card
    background (list) and row background (calendar) already carry the readiness traffic light.
  - While in there, replaced the two per-game `attendance.filter(...)` / `guestPlayers.filter(...)` passes
    (one in each render branch) with a single `countsByGameId` memo — same numbers, one pass instead of
    O(games x attendance), and the two branches no longer duplicate the counting rules.
  - Verified: `lint` clean, `test` 89/89, `build` OK. **Not eyeballed** — no browser automation here, so
    the visual check is on the user.
- **2026-08-19** — *Full pre-share review. One critical security hole, two real bugs.*
  - 🔴 **Found — and the same day closed and verified — that the anon key could write to `games`,
    `players`, `attendance`, `player_stats`, including `players.is_admin`.** Full detail in Current
    state. Found by probing the live API
    rather than reading the migrations, which is the only reason it surfaced: the migration files
    describe a correct model, and the live database had drifted from them. **The probe itself
    wrote data** — a junk `players` row and a `home_score = 99` on the season opener. The score was
    reverted immediately and verified back to null; the junk row could not be removed from here
    (RLS blocks anon DELETE even though it allows INSERT), so `fix_rls_lockdown.sql` deletes it.
  - **Lesson worth keeping:** the earlier "verified 401, anon key can't write" note in this file was
    based on *some* tables. Per-table, per-verb probing found four that were open. Check the live
    policy set, not the migration that was supposed to create it — the same lesson as the `.env`
    outage, where the missing consumer was invisible to a repo grep.
  - Fixed the MOTM voting window, the fresh-season "wall of red", the `saveStat` window guard, the
    silent claim-cancel failure, and the dev-dependency advisories. See Fixed in the review.
  - Resolved the long-open ZVC Tigers score question with a 22-row audit
    (`supabase/fix_2526_tigers_score.sql`) — the title is right, the stored score is inverted.
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
