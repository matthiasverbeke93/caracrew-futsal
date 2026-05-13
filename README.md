# caracrew-futsal

Attendance, goals and assists tracker for **K. Caracrew SK** (LZV Cup). React + Vite + Supabase.

## Stack
- **React 19 + Vite** front-end (single `App` shell + per-tab components in `src/components/`).
- **Supabase** for `games`, `players`, `attendance`, `player_stats`, `guest_players`, `motm_votes`, `opponent_strength`.
- **GitHub Actions** sync LZV scores weekly (`sync-lzv.yml`), opponent palmares monthly (`sync-palmares.yml`), and optional Friday digest email (`weekly-digest.yml`).

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
- `npm run seed:2627` — clone 25–26 fixtures into a dummy 26–27 season (+1 year dates, no scores); needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (see Seasons).
- `npm run digest:weekly` — send the squad pulse email via [Resend](https://resend.com); needs service role + `RESEND_API_KEY` + `DIGEST_TO_EMAIL` (see Weekly digest).

## Weekly digest email

Friday schedule (GitHub Actions) runs `scripts/send-weekly-digest.mjs`: upcoming fixtures, fixed-roster RSVP gaps for the next match, and Man of the Match voting status for open polls.

**GitHub:** add secret `RESEND_API_KEY`, repository variable `DIGEST_TO_EMAIL` (comma-separated recipients). Optional: `DIGEST_FROM_EMAIL`, `PUBLIC_APP_URL` (your deployed app link in the CTA). Uses `LZV_SEASON_SLUG` when set (same as sync workflows), else default season from `src/seasons.js`.

**Local test:** copy `.env.example` digest vars into a shell session or `.env` loaded manually, then `npm run digest:weekly`.

## Seasons
The app is multi-season. Each `games` row and each `opponent_strength` row carries a `season_slug` (e.g. `2526`, `2627`). The UI exposes a switcher in the dashboard header (`?season=` in the URL). Use **Insights** for season trends (monthly scoring pace, leader bars, live table) or **Team stats** for the full stats/compliance view (`?insights=1` / `?team_stats=1`).

See also:
- `src/data/seasonLeagueStandings.js` — optional manual standings per season.
- `src/data/seasonTeamStatsOverrides.js` — manual per-player snapshot when Supabase doesn't have full data yet.

To start a new season:
1. Run `supabase/season_multi.sql` (idempotent) to add `season_slug` columns and the composite key on `opponent_strength`.
2. Insert that season's fixtures into `games` with the new slug.
3. Set repo variable `LZV_SEASON_SLUG` (+ `LZV_TEAM_URL`, `LZV_OUR_TEAM_ID`) and run the sync workflows.
4. Optionally fill `LEAGUE_STANDINGS_BY_SEASON[<slug>]` in `seasonLeagueStandings.js`.

**Dummy 26–27 preview (clone 25–26 calendar with +1 year, no scores):** set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run `npm run seed:2627` (add `--dry-run` on the script to preview). Or run `supabase/seed_dummy_2627.sql` in the Supabase SQL Editor if your `games` columns match.

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
   \i supabase/admin_player_ops.sql
   ```
   `auth_ownership.sql` adds `players.auth_user_id` + `players.is_admin`, helper functions, and RLS policies. `auth_claims.sql` adds the `player_claims` table and approval RPCs used by the **Claims** tab. `admin_player_ops.sql` adds `players.archived_at` and roster management RPCs (add, rename, toggle fixed/guest, archive/restore, hard-delete) used by the **Players** tab.

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
- **Players** — full roster management: add new players, rename, toggle fixed/guest, make/remove admin, link/unlink accounts, archive (soft delete — keeps history) and restore, or hard-delete (cascades attendance, stats, votes, claims). Archived players are hidden from `fixedPlayers`, the live team stats, and new-game attendance UI, but they remain visible inside historical games where they have a row.
- **Accounts** — every auth user, highlighting those not linked yet.

## SQL
All schema migrations live under `supabase/` and are safe to re-run.
