-- Goalkeeper flag on the roster, so every fixture can be checked for a keeper.
--
-- `players.is_goalkeeper` is a property of the player, not of a game: the app
-- derives "do we have a goalie for this match?" by intersecting the flag with the
-- attendance rows (see src/utils/goalkeeper.js). A team can have more than one.
--
-- Run this after `admin_player_ops.sql`. Idempotent, safe to re-run.

alter table players add column if not exists is_goalkeeper boolean not null default false;

create index if not exists players_is_goalkeeper_idx
  on players (is_goalkeeper)
  where is_goalkeeper;

comment on column players.is_goalkeeper is
  'Player keeps goal. Set from the admin panel; used to warn when no keeper is In for a fixture.';

-- ---------------------------------------------------------------------------
-- admin_update_player gains a `goalkeeper_arg`.
--
-- The parameter list changes, so the old 3-argument function has to go rather
-- than be `create or replace`d — leaving both would give PostgREST two
-- candidates for the same named-argument call and it would refuse to choose.
-- The app already calls it with named arguments only, so the extra default
-- parameter is backwards compatible.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_update_player(text, text, boolean);

create or replace function public.admin_update_player(
  player_id_arg  text,
  name_arg       text default null,
  fixed_arg      boolean default null,
  goalkeeper_arg boolean default null
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
     set name          = coalesce(nullif(trim(name_arg), ''), name),
         fixed         = coalesce(fixed_arg, fixed),
         is_goalkeeper = coalesce(goalkeeper_arg, is_goalkeeper)
   where id = player_id_arg;
end;
$$;

grant execute on function public.admin_update_player(text, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Who actually kept goal in a given fixture.
--
-- Separate from `players.is_goalkeeper` on purpose: the roster flag answers
-- "is this player a keeper" (used to check *upcoming* fixtures for a goalie),
-- while this per-game flag records who went in goal on the night — which is
-- regularly somebody who is not a keeper at all.
-- ---------------------------------------------------------------------------
alter table player_stats
  add column if not exists kept_goal boolean not null default false;

comment on column player_stats.kept_goal is
  'This player kept goal in this fixture. Independent of players.is_goalkeeper.';

alter table guest_players
  add column if not exists kept_goal boolean not null default false;

comment on column guest_players.kept_goal is
  'This guest kept goal in this fixture. Independent of players.is_goalkeeper.';
