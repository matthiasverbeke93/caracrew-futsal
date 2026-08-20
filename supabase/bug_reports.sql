-- ============================================================================
-- bug_reports — in-app "Report a bug" button.
-- Run this in the Supabase SQL editor BEFORE deploying the frontend that uses
-- it; without the table the button's insert 404s and the user gets an error
-- toast.
-- ============================================================================
--
-- HOW IT REACHES THE INBOX
-- The client only inserts. A scheduled GitHub Action
-- (.github/workflows/bug-reports.yml -> scripts/send-bug-reports.mjs) picks up
-- rows with emailed_at is null, mails them via Resend with the SERVICE ROLE
-- key (bypasses RLS), and stamps emailed_at. The row is the source of truth:
-- if mail is broken the report is still here, visible in the admin panel.
--
-- WHY ANON CAN INSERT BUT NOT READ
-- Anyone must be able to report a bug, including a signed-out visitor — so
-- insert is open. Reports carry the reporter's email and a page URL, so SELECT
-- is admin-only; a public read would hand the squad's addresses to anyone with
-- the anon key (which is compiled into the client bundle).
--
-- KNOWN TRADE-OFF: an open insert policy is spammable by anyone holding the
-- anon key. Mitigations here are cheap ones only — a length-capped message and
-- a server-set created_at. Real rate limiting needs an edge function or a
-- gateway; at squad scale the admin panel's delete is the answer instead.

begin;

create table if not exists bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  kind text not null default 'bug'
    check (kind in ('bug', 'idea', 'data')),
  severity text not null default 'annoying'
    check (severity in ('blocking', 'annoying', 'minor')),
  message text not null
    check (length(btrim(message)) between 3 and 4000),

  -- Reporter: resolved from the session when signed in, free-text when not.
  auth_user_id uuid references auth.users(id) on delete set null,
  reporter_player_id text references players(id) on delete set null,
  reporter_name text check (reporter_name is null or length(reporter_name) <= 120),
  reporter_email text check (reporter_email is null or length(reporter_email) <= 200),

  -- Context, collected automatically so nobody has to be asked "where were you?".
  page_url text check (page_url is null or length(page_url) <= 500),
  season_slug text check (season_slug is null or length(season_slug) <= 16),
  app_build text check (app_build is null or length(app_build) <= 64),
  user_agent text check (user_agent is null or length(user_agent) <= 500),
  viewport text check (viewport is null or length(viewport) <= 32),

  -- Delivery + triage bookkeeping (written by the job / an admin, never the client).
  emailed_at timestamptz,
  email_error text,
  email_attempts int not null default 0,
  resolved_at timestamptz
);

-- Columns added after the first release land here, so the file stays re-runnable.
alter table bug_reports add column if not exists resolved_at timestamptz;
alter table bug_reports add column if not exists app_build text;
alter table bug_reports add column if not exists email_attempts int not null default 0;

-- The mailer's query: oldest unsent first. Partial index — the sent rows, which
-- are all of them after a while, stay out of it.
create index if not exists bug_reports_unsent_idx
  on bug_reports (created_at)
  where emailed_at is null;

create index if not exists bug_reports_created_idx
  on bug_reports (created_at desc);

alter table bug_reports enable row level security;

-- Drop whatever is attached, whatever it is called — same lesson as
-- fix_rls_lockdown.sql: targeted drops by name miss dashboard-created policies,
-- and one surviving permissive policy decides the outcome.
do $do$
declare
  r record;
begin
  for r in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'bug_reports'
  loop
    execute format('drop policy %I on public.bug_reports', r.policyname);
  end loop;
end
$do$;

-- Anyone may file one. The with-check clauses are the interesting part:
--   * the delivery columns must be null / zero, or a spammer could insert a
--     pre-stamped row (or one already at the attempt ceiling) that the mailer
--     would never pick up.
--   * auth_user_id must be your own uid (or null), so a report cannot be
--     attributed to someone else.
create policy "bug_reports_public_insert"
on bug_reports for insert
with check (
  emailed_at is null
  and email_error is null
  and resolved_at is null
  and email_attempts = 0
  and (auth_user_id is null or auth_user_id = auth.uid())
);

create policy "bug_reports_admin_read"
on bug_reports for select
using (is_admin_user());

create policy "bug_reports_admin_update"
on bug_reports for update
using (is_admin_user())
with check (is_admin_user());

create policy "bug_reports_admin_delete"
on bug_reports for delete
using (is_admin_user());

commit;

-- Verify (as an admin, from the app's anon key):
--   select count(*) from bug_reports;              -- works for admins, 0 rows for others
--   insert into bug_reports (message) values ('x'); -- refused: fails the length check
