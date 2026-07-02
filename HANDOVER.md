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
- **`index.css`** — one global stylesheet, plain CSS. `:root` holds the palette: base tokens (`--surface-*`,
  `--text-*`, `--accent*`) **plus** the semantic colour system — `--tone-*` (success/danger/warning/caution/info
  bg+fg pairs), `--signal-*` (readiness rails, toast accents), `--diff-*` (difficulty ramp), `--form-*`. Use these
  tokens for any status colour rather than new hex. Brand colours (WhatsApp green) are intentionally left literal.
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
- **Seasons:** multi-season via `season_slug` (`2526` = 25-26, `2627` = 26-27). `26-27` is current/default and is
  the prominent pill; older seasons sit behind the **"Historical seasons"** dropdown (`SeasonSwitcher`).
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

## Current state (as of 2026-07-02)
- Season switcher restructured: 26-27 up front, older seasons behind a "Historical seasons" dropdown.
- Sidebar cards and the match detail panel **decluttered** (fewer competing colour/chip signals).
- **Write failures now surface** as toasts (were silent). **Semantic colour tokens** in place. **Vitest** added
  with `utils/` coverage. Header "Team dashboard" eyebrow removed.
- Known follow-ups discussed but **not done**: `React.lazy` code-splitting for `AdminPanel` /
  `SeasonOverviewPage` / `PlayerProfileModal` (initial JS bundle is ~495 KB, one chunk); memoizing the write
  functions in `useFutsalData`; arrow-key roving focus in the `SeasonSwitcher` / Share menus.

## Session log
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
