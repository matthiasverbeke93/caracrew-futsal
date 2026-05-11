-- Roster management helpers for the admin panel.
--
-- Adds a soft-delete column (`archived_at`) and a handful of SECURITY DEFINER
-- functions that let admins manage the roster through PostgREST RPCs.
--
-- Run this after `auth_ownership.sql` and `auth_claims.sql`. Idempotent.

alter table players add column if not exists archived_at timestamptz;

create index if not exists players_archived_at_idx
  on players (archived_at)
  where archived_at is not null;

comment on column players.archived_at is
  'When set, the player is hidden from active rosters & new-game flows but kept for history.';

-- ---------------------------------------------------------------------------
-- Archive / restore (soft delete)
-- ---------------------------------------------------------------------------
create or replace function public.admin_archive_player(player_id_arg text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  update players set archived_at = now() where id = player_id_arg;
end;
$$;

create or replace function public.admin_restore_player(player_id_arg text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  update players set archived_at = null where id = player_id_arg;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hard delete (cascade everything that references this player)
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_player(player_id_arg text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  delete from attendance     where player_id  = player_id_arg;
  delete from player_stats   where player_id  = player_id_arg;
  delete from motm_votes     where nominee_id = player_id_arg;
  delete from player_claims  where player_id  = player_id_arg;
  delete from players        where id         = player_id_arg;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create / update
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_player(
  player_id_arg text,
  name_arg      text,
  fixed_arg     boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  if length(coalesce(trim(name_arg), '')) = 0 then
    raise exception 'Name is required';
  end if;
  if length(coalesce(trim(player_id_arg), '')) = 0 then
    raise exception 'Player ID is required';
  end if;
  if exists (select 1 from players where id = player_id_arg) then
    raise exception 'A player with this ID already exists';
  end if;
  insert into players (id, name, fixed)
    values (player_id_arg, trim(name_arg), coalesce(fixed_arg, false));
end;
$$;

create or replace function public.admin_update_player(
  player_id_arg text,
  name_arg      text default null,
  fixed_arg     boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  update players
     set name  = coalesce(nullif(trim(name_arg), ''), name),
         fixed = coalesce(fixed_arg, fixed)
   where id = player_id_arg;
end;
$$;

-- ---------------------------------------------------------------------------
grant execute on function public.admin_archive_player(text)               to authenticated;
grant execute on function public.admin_restore_player(text)               to authenticated;
grant execute on function public.admin_delete_player(text)                to authenticated;
grant execute on function public.admin_add_player(text, text, boolean)    to authenticated;
grant execute on function public.admin_update_player(text, text, boolean) to authenticated;
