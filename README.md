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

## Accounts and permissions

Email + password auth via Supabase. Reads stay public; writes are scoped:

| Action                                  | Who can do it                          |
|-----------------------------------------|-----------------------------------------|
| Read everything                         | Anyone                                  |
| Mark own attendance                     | Signed-in, linked player (own row)     |
| Edit own goals / assists                | Signed-in, linked player (own row)     |
| Vote MOTM                               | Any signed-in user (one per game)      |
| Set final score, expected G/A           | Admin                                  |
| Add / remove ad-hoc guest               | Admin                                  |
| Override anyone's attendance or stats   | Admin                                  |

### One-time setup

1. **Enable email auth in Supabase** (Authentication → Providers → Email). For a friction-free family team, you can disable email confirmation while you onboard, then re-enable.
2. **Apply the migrations** in order (idempotent):
   ```sql
   \i supabase/auth_ownership.sql
   \i supabase/auth_claims.sql
   ```
   `auth_ownership.sql` adds `players.auth_user_id` + `players.is_admin`, helper functions, and RLS policies. `auth_claims.sql` adds the `player_claims` table, RLS, and admin RPC functions used by the in-app **Admin panel**.

### Onboarding a player (self-service)

1. Player clicks **Sign in → Create an account** in the hero and signs up with their email.
2. They see a yellow **"Claim your player"** banner. Clicking it opens a roster picker — they pick their name and submit.
3. Admin opens the **Admin panel** (chip in the hero) and sees the pending claim. One click on **Approve** links the account; **Approve + admin** also grants admin.

The player refreshes — the hero chip shows their name + role badge.

### Manual linking / promotion (fallback)

Everything is also doable directly in SQL when needed:

```sql
-- Link an account to a player manually
update players
   set auth_user_id = (select id from auth.users where email = lower('player@example.com'))
 where lower(name) = lower('Their Full Name');

-- Promote yourself (or anyone) to admin
update players set is_admin = true where lower(name) = lower('matthias verbeke');
```

### Admin panel

The hero shows an **Admin** button for users with `is_admin = true`. It opens a modal with three tabs:
- **Claims** — pending self-service claims with Approve / Approve + admin / Reject.
- **Players** — full roster with quick **Make admin / Remove admin / Unlink / Link to account…** actions.
- **Accounts** — every auth user, highlighting those not linked yet.

## SQL
All schema migrations live under `supabase/` and are safe to re-run.
