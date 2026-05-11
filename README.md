# caracrew-futsal

Attendance, goals and assists tracker for **K. Caracrew SK** (LZV Cup). React + Vite + Supabase.

## Stack
- **React 19 + Vite** front-end (single `App` shell + per-tab components in `src/components/`).
- **Supabase** for `games`, `players`, `attendance`, `player_stats`, `guest_players`, `motm_votes`, `opponent_strength`.
- **GitHub Actions** sync LZV scores weekly (`sync-lzv.yml`) and opponent palmares monthly (`sync-palmares.yml`).

## Local dev
```bash
npm install
cp .env.example .env   # fill in Supabase URL + anon key
npm run dev
```

`.env` needs:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_REQUIRE_AUTH_FOR_WRITES=false   # optional
```

## Scripts
- `npm run dev` — Vite dev server.
- `npm run build` — production build to `dist/`.
- `npm run lint` — ESLint (flat config, React + hooks plugins).
- `npm run sync:lzv` / `npm run sync:lzv:dryrun` — pull final scores from `lzvcup.be`.
- `npm run sync:palmares` / `npm run sync:palmares:dryrun` — refresh opponent strength.

## Seasons
The app is multi-season. Each `games` row and each `opponent_strength` row carries a `season_slug` (e.g. `2526`, `2627`). The UI exposes a switcher in the hero (`?season=` in the URL). See:
- `src/seasons.js` — slug definitions + default season.
- `src/data/seasonLeagueStandings.js` — optional manual standings per season.
- `src/data/seasonTeamStatsOverrides.js` — manual per-player snapshot when Supabase doesn't have full data yet.

To start a new season:
1. Run `supabase/season_multi.sql` (idempotent) to add `season_slug` columns and the composite key on `opponent_strength`.
2. Insert that season's fixtures into `games` with the new slug.
3. Set repo variable `LZV_SEASON_SLUG` (+ `LZV_TEAM_URL`, `LZV_OUR_TEAM_ID`) and run the sync workflows.
4. Optionally fill `LEAGUE_STANDINGS_BY_SEASON[<slug>]` in `seasonLeagueStandings.js`.

## Editing windows
- **Attendance** is editable up to and including the game day; it locks the day after.
- **Stats** (goals/assists, tally targets) lock 10 days after the game (`STATS_FREEZE_DAYS` in `src/utils/game.js`).

## SQL
All schema migrations live under `supabase/` and are safe to re-run.
