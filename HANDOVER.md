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
cp .env.example .env      # needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (a real .env is already present)
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
- **Dates are local-day strings, not Date math.** `isPlayed`/editable checks compare `game_date` (`YYYY-MM-DD`)
  against a locally-formatted "today" string. This is intentional (fixes an earlier UTC off-by-one). Don't
  "fix" it by switching to UTC `Date` comparisons.
- **Optimistic writes.** All mutations in `useFutsalData` update state first and roll back on error. Keep new
  writes to that pattern (snapshot → mutate → on error restore + `notify(...)` toast + `loadAll()`).
- **Line endings:** repo is LF; on this Windows workspace git prints harmless `LF will be replaced by CRLF`
  warnings on add. Ignore them.
- **`file:` there is none** — single package, plain npm. No monorepo/workspaces.
- **Web fonts** come from Google Fonts (`index.html`); offline they fall back to a system sans — fine, just less
  distinctive. **Header is static** (scrolls away) by the user's choice — not sticky/fixed.
- **No component uses `React.memo`.** So memoizing callbacks in `useFutsalData` buys nothing on its own — don't
  add `useCallback` there expecting a win without also memoizing the heavy children (profile first).

## Current state (as of 2026-07-02)
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
    `dist/` root, so they serve at `/fixtures-2627.ics`. Feeds for 25-26 (22) and 26-27 (30) are committed.
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
