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
- `npm run sync:lzv` / `npm run sync:lzv:dryrun` — pull final scores from `lzvcup.be` (also reports probable
  reschedules — see Score sync below).
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

## The squad guide

**How it works** in the header opens `GuideModal` — the player-facing guide (RSVP options, how to read the headcount, the two editing windows, a deadlines table, the calendar feed). It has its own link, `?guide=1`, so it can be shared with people who have no account: <https://caracrew.org/?guide=1>. The modal shows that link with a copy button.

Every number in it is **read from the constant that enforces it** (`STATS_FREEZE_DAYS`, `MOTM_VOTING_DAYS`, `MIN_PLAYERS_WARNING` / `JUST_RIGHT_PLAYERS`, `ATTENDANCE_OPTIONS`) and the feed URL from `window.location.origin`, so changing a rule updates the guide with it. **Do not hardcode a number there.**

## Bug reports

A **Report a bug** button sits in the header, open to signed-out visitors too. It writes one row to `bug_reports`; a scheduled Action (`.github/workflows/bug-reports.yml`, every 6 hours) runs `scripts/send-bug-reports.mjs`, mails each new row and stamps `emailed_at`.

**Run `supabase/bug_reports.sql` before deploying the frontend** — without the table the button's insert fails and the reporter gets an error.

- **The row is the source of truth**, not the email. A broken mailer loses nothing: reports show up in **Admin panel → Bugs**, where they can be resolved, reopened or deleted.
- **Context is attached automatically** — page URL, season, viewport, browser and the build timestamp the bundle was compiled with — so nobody has to be asked "which page were you on?".
- **Identity comes from the session** when signed in (player + account email), and the typed name/email is only a fallback for anonymous visitors. A signed-in report cannot be filed under someone else's name.
- **Anyone can insert, only admins can read.** Reports carry email addresses, so a public `select` would leak them to anyone holding the anon key. The flip side is that the insert policy is spammable — the answer at squad scale is the admin panel's delete.
- **Delivery is retried** up to 5 times per report (`email_attempts`), then that row is left alone and reported in the log, so one unmailable report can't fail every run forever.

**GitHub:** repo variable `BUG_REPORT_TO_EMAIL` (where reports go — the job refuses to run without it), optional `BUG_REPORT_FROM_EMAIL` (falls back to `DIGEST_FROM_EMAIL`). Reuses the same `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `RESEND_API_KEY` secrets as the digest.

**Need one now?** The schedule is every 6 hours; run the workflow manually for an immediate send (it is idempotent, so an extra run cannot double-send).

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

## Score sync and reschedules

`sync-lzv.mjs` (weekly, Sunday 06:00 UTC) matches each result LZV publishes to a stored fixture **on the exact
date**. That means a rescheduled match used to be two silent non-events at once: LZV's result found no row to
write to, and the stored row just stayed empty forever. Neither said the word "reschedule".

The job now reconciles both directions and **reports** what it cannot match (`reconcileFixtures`):

- **Possible reschedule** — a result whose date has no fixture, but an unclaimed row against the same opponent
  sits elsewhere in the season. Fixtures already matched on their own date are claimed first, so the second leg
  of a double round-robin is not mistaken for the first. Where two candidates remain, both are listed.
- **Unmatched result** — a result with no plausible row at all.
- **Stale fixture** — a fixture more than `STALE_RESULT_DAYS` (7) past, still unscored, that LZV never reported.
  Postponed, or moved.

⚠️ **It never moves a date itself, and you must not re-import one.** The `id` encodes the old date, and
`attendance`, `player_stats`, `guest_players` and `motm_votes` all FK to `game_id` — a fresh row on the new date
silently abandons every RSVP already collected. Update `game_date` on the **existing** row; the job prints the
exact `update` to run. Then re-run it to fill the score. See [`CALENDAR-IMPORT.md`](./CALENDAR-IMPORT.md).

Findings are emitted as GitHub Actions `::warning::` annotations, so they surface in the run summary instead of
scrolling past in the log.

## Editing windows
- **Attendance** is editable for the next 3 upcoming games only; later future fixtures stay locked until they enter that window.
- **Stats** (goals/assists) lock 5 days after the game (`STATS_FREEZE_DAYS` in `src/utils/game.js`). The freeze is absolute — admins included.
- **MOTM voting** opens at estimated full-time (kickoff + 2h) and closes 5 days later (`MOTM_VOTING_DAYS` in `src/utils/motm.js`). A MotM win only appears in the season stats once voting has closed, so the winner now shows up 5 days after the match rather than the next day.

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

### Forgot password

The sign-in modal has a **Forgot your password?** link. It sends a Supabase recovery email
(`resetPasswordForEmail`), and the reply is deliberately the same whether or not the address has an
account — telling a stranger which emails are on the roster is a free leak.

Opening the link returns the user to the app with a short-lived session; `useAuthSession` sees this
(the `PASSWORD_RECOVERY` event, or `type=recovery` on the landing URL) and shows **Set a new
password**, which calls `updateUser({ password })` and keeps them signed in. A stale or already-used
link instead reopens the reset form with the reason on screen. The `#access_token=…` fragment is
stripped once consumed so a refresh does not re-enter the flow.

The link must be opened **on the same device/browser** that will set the password — the session rides
the URL, not the account. It is single-use and expires after roughly an hour.

Two Supabase settings this depends on (Authentication → URL Configuration): **Site URL** and the
**Redirect URLs** allowlist. The app sends a **bare origin** as `redirectTo` — `VITE_SITE_URL` if
set, else `window.location.origin`, trailing slash stripped — so the allowlist needs the origin
itself, not just a `…/**` pattern:

```
https://caracrew.org          # the live apex — what the app sends in production
http://localhost:3000         # local dev (the port is pinned in vite.config.js for this reason)
```

Supabase silently drops an unallowlisted `redirectTo` and falls back to **Site URL**, so a missing
entry does not error — it just quietly sends people somewhere else. Keep Site URL on the same apex.

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

The hero shows an **Admin** button for users with `is_admin = true`. It opens a modal with five tabs:
- **Claims** — pending self-service claims with Approve / Approve + admin / Reject.
- **Players** — full roster management: add new players, rename, toggle fixed/guest, make/remove admin, link/unlink accounts, archive (soft delete — keeps history) and restore, or hard-delete (cascades attendance, stats, votes, claims). Archived players are hidden from `fixedPlayers`, the live team stats, and new-game attendance UI, but they remain visible inside historical games where they have a row.
- **Accounts** — every auth user, highlighting those not linked yet.
- **Bugs** — reports filed with the header's **Report a bug** button; resolve, reopen or delete.
- **Data** — see below.

### Data tab: scores checked against their titles

Every stored final score is cross-checked against the fixture `title` it came with (`src/utils/scoreAudit.js`).
The title is a **second, independent record of the same result**, so the two disagreeing means one is wrong.

This exists because on 2025-10-14 the ZVC Tigers row stored `10-1` while its own title read
`ZVC Tigers 10 - 1 K Caracrew SK` — a 1-10 defeat counted as a 10-1 win, worth 3 phantom league points and an
18-goal swing in the record card, the projected table and win%. It survived until someone hand-audited all 22
rows. The tab does that audit on every load, across **all seasons** (the bad row was in a season the app had
already stopped defaulting to, which is how it went unnoticed).

Four verdicts, worst first:
- **Score inverted** — swapping `home_score` / `away_score` would match the title. One-line fix, offered as
  copyable SQL.
- **Score disagrees** — they differ in a way swapping cannot explain; a human decides. Check lzvcup.be first.
- **Result not stored** — the title carries a result the row never stored, i.e. the weekly sync missed it.
- **Cannot be checked** — a score is stored but the title carries none, so nothing confirms it.

Remember the convention the check relies on: **`home_score` is *our* goals** whichever side we played on, while
the `title` names teams in LZV's order (real home side first). That is also why the title is the only store of
home/away.

## SQL
All schema migrations live under `supabase/` and are safe to re-run.
