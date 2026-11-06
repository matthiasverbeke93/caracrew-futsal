-- Teammates can fill in each other's goals/assists/keeper (2026-11-06).
--
-- Before: a player could only write their own player_stats row (admins any row), so a
-- scorer who never opened the form left the goals short and only an admin could fix it.
-- Now: a signed-in player who was In (attendance.status = 'playing') for a fixture may
-- write the row of anyone else who was In for that same fixture. The "played" flag stays
-- the owner's (or an admin's) call — a trigger keeps it unchanged for teammate writes.
-- Delete stays owner-or-admin. Idempotent; safe to re-run.

create or replace function public.was_in_for_game(p_game_id text, p_player_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from attendance
    where game_id = p_game_id and player_id = p_player_id and status = 'playing'
  );
$$;
grant execute on function public.was_in_for_game(text, text) to authenticated;

-- Owner, admin, or a teammate who was In alongside the row's player.
create or replace function public.can_write_player_stats(p_game_id text, p_player_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_admin_user()
    or p_player_id = current_player_id()
    or (
      current_player_id() is not null
      and was_in_for_game(p_game_id, current_player_id())
      and was_in_for_game(p_game_id, p_player_id)
    );
$$;
grant execute on function public.can_write_player_stats(text, text) to authenticated;

drop policy if exists player_stats_owner_insert on player_stats;
drop policy if exists player_stats_owner_update on player_stats;
create policy player_stats_owner_insert on player_stats for insert to authenticated
  with check ((select can_write_player_stats(game_id, player_id)));
create policy player_stats_owner_update on player_stats for update to authenticated
  using      ((select can_write_player_stats(game_id, player_id)))
  with check ((select can_write_player_stats(game_id, player_id)));

-- A teammate's write never changes "played": kept as it was on update, true on insert.
create or replace function public.player_stats_guard_played()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No signed-in user = SQL editor / service role: leave the row alone.
  if auth.uid() is null or is_admin_user() or new.player_id = current_player_id() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.played := old.played;
  else
    new.played := true;
  end if;
  return new;
end;
$$;

drop trigger if exists player_stats_guard_played on player_stats;
create trigger player_stats_guard_played
  before insert or update on player_stats
  for each row execute function public.player_stats_guard_played();
