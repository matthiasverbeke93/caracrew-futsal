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
- `npm run digest:weekly` — send the squad pulse email via [Resend](https://resend.com); needs service role + `RESEND_API_KEY` (see Weekly digest).
- `npm run bugs:send` — mail any unsent rows in `bug_reports` (see Bug reports).

## Weekly digest email

Friday schedule (GitHub Actions) runs `scripts/send-weekly-digest.mjs`: upcoming fixtures, fixed-roster RSVP gaps for the next match, and Man of the Match voting status for open polls.

**Who receives it:** the roster, not a hand-edited list. Every non-archived row in `players` whose `auth_user_id` points at a **confirmed** `auth.users` account gets one mail. Consequences worth knowing:

- A squad member with no account, or one whose email is unconfirmed, gets nothing — the run log names them (`no account linked`, `linked but email unconfirmed`), so check the log rather than guessing.
- A sign-up that was never linked to a player is skipped, which is what keeps strangers off the list.
- Each person gets their own mail, so nobody sees anyone else's address.
- Reading `auth.users` goes through the GoTrue admin API, so the **service role** key is mandatory.

**GitHub:** add secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`. Optional repo variables: `DIGEST_TO_EMAIL` (**extra** recipients who have no account — no longer the squad list), `DIGEST_SKIP_EMAILS` (opt-out), `DIGEST_FROM_EMAIL`, `PUBLIC_APP_URL` (deployed app link in the CTA). Season comes from `LZV_SEASON_SLUG`, defaulting to `2627`.

⚠️ **`DIGEST_FROM_EMAIL` must be a verified domain before this reaches the squad.** The default `onboarding@resend.dev` only delivers to the Resend account owner's own address; everyone else 403s. The job warns about this in its log and exits non-zero if any send fails.

**Check the list before sending:** run the workflow manually with the **dry run** input ticked (Actions → Weekly squad digest → Run workflow), or `DIGEST_DRY_RUN=1 npm run digest:weekly` locally. It resolves and prints recipients without sending.

**Local test:** copy `.env.example` digest vars into a shell session or `.env` loaded manually, then `npm run digest:weekly`.

## Bug reports

A **Report a bug** button sits in the header, open to signed-out visitors too. It writes one row to `bug_reports`; a scheduled Action (`.github/workflows/bug-reports.yml`, every 15 minutes) runs `scripts/send-bug-reports.mjs`, mails each new row and stamps `emailed_at`.

**Run `supabase/bug_reports.sql` before deploying the frontend** — without the table the button's insert fails and the reporter gets an error.

- **The row is the source of truth**, not the email. A broken mailer loses nothing: reports show up in **Admin panel → Bugs**, where they can be resolved, reopened or deleted.
- **Context is attached automatically** — page URL, season, viewport, browser and the build timestamp the bundle was compiled with — so nobody has to be asked "which page were you on?".
- **Identity comes from the session** when signed in (player + account email), and the typed name/email is only a fallback for anonymous visitors. A signed-in report cannot be filed under someone else's name.
- **Anyone can insert, only admins can read.** Reports carry email addresses, so a public `select` would leak them to anyone holding the anon key. The flip side is that the insert policy is spammable — the answer at squad scale is the admin panel's delete.
- **Delivery is retried** up to 5 times per report (`email_attempts`), then that row is left alone and reported in the log, so one unmailable report can't fail every run forever.

**GitHub:** repo variable `BUG_REPORT_TO_EMAIL` (where reports go — the job refuses to run without it), optional `BUG_REPORT_FROM_EMAIL` (falls back to `DIGEST_FROM_EMAIL`). Reuses the same `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `RESEND_API_KEY` secrets as the digest.

**Check without sending:** Actions → Send bug reports → Run workflow with **dry run** ticked, or `BUG_REPORT_DRY_RUN=1 npm run bugs:send`.

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

## Editing windows
- **Attendance** is editable for the next 3 upcoming games only; later future fixtures stay locked until they enter that window.
- **Stats** (goals/assists and MOTM) lock 10 days after the game (`STATS_FREEZE_DAYS` in `src/utils/game.js`).

## Accounts and permissions

Email + password auth via Supabase. Reads stay public; writes are scoped:

| Action                                  | Who can do it                          |
|-----------------------------------------|-----------------------------------------|
| Read everything                         | Anyone                                  |
| Mark own attendance                     | Signed-in, linked player (own row)     |
| Edit own goals / assists                | Signed-in, linked player (own row)     |
| Vote MOTM                               | Any signed-in user (one per game)      |
| Set final score                         | Admin                                  |
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
