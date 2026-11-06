-- "When did the player answer THEMSELVES?" for the on-time scores (2026-11-06).
--
-- The RSVP / stats on-time scores used `updated_at`, which moves on any write — so when an
-- admin (or, since stats_teammates.sql, a teammate) filled a row in for someone, it counted
-- in that player's favour. `self_updated_at` is stamped by the database only when the
-- signed-in user IS the row's player; any other write keeps the previous value (null on a
-- new row). The client cannot set it: the trigger overwrites whatever it sends.
--
-- History: who wrote the existing rows was never recorded, so on first run they are
-- backfilled with `updated_at` (scores for past games stay as they were). Idempotent: the
-- backfill only runs in the same run that adds the column.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance' and column_name = 'self_updated_at'
  ) then
    alter table attendance add column self_updated_at timestamptz;
    update attendance set self_updated_at = updated_at;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'player_stats' and column_name = 'self_updated_at'
  ) then
    alter table player_stats add column self_updated_at timestamptz;
    update player_stats set self_updated_at = updated_at;
  end if;
end;
$$;

comment on column attendance.self_updated_at is
  'Last write by the player themself (DB-stamped). Drives the RSVP on-time score; admin writes do not move it.';
comment on column player_stats.self_updated_at is
  'Last write by the player themself (DB-stamped). Drives the stats on-time score; admin/teammate writes do not move it.';

create or replace function public.stamp_self_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No signed-in user = SQL editor / service role (anon writes are refused by RLS):
  -- take the row as written, so the column can be corrected by hand.
  if auth.uid() is null then
    return new;
  end if;
  if new.player_id = current_player_id() then
    new.self_updated_at := now();
  elsif tg_op = 'UPDATE' then
    new.self_updated_at := old.self_updated_at;
  else
    new.self_updated_at := null;
  end if;
  return new;
end;
$$;

-- Players without an account can never have saved a row themselves: whatever the
-- backfill gave them was an admin's write. Safe to re-run.
update attendance   set self_updated_at = null
  where self_updated_at is not null and player_id in (select id from players where auth_user_id is null);
update player_stats set self_updated_at = null
  where self_updated_at is not null and player_id in (select id from players where auth_user_id is null);

drop trigger if exists attendance_stamp_self_updated_at on attendance;
create trigger attendance_stamp_self_updated_at
  before insert or update on attendance
  for each row execute function public.stamp_self_updated_at();

drop trigger if exists player_stats_stamp_self_updated_at on player_stats;
create trigger player_stats_stamp_self_updated_at
  before insert or update on player_stats
  for each row execute function public.stamp_self_updated_at();
