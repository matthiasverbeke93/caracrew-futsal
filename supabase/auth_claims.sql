-- Self-service player claim flow + admin helper functions.
--
-- 1. New `player_claims` table: a signed-in user proposes "I am player X",
--    an admin approves/rejects.
-- 2. `admin_approve_claim` / `admin_reject_claim` SECURITY DEFINER fns let
--    admins resolve claims atomically through PostgREST.
-- 3. `admin_list_auth_users()` exposes auth.users emails to admins
--    only (PostgREST doesn't allow direct selects on auth.users).
--
-- Run this after `auth_ownership.sql`.

create table if not exists player_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  message text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);

create index if not exists player_claims_user_idx   on player_claims (user_id);
create index if not exists player_claims_player_idx on player_claims (player_id);
create index if not exists player_claims_status_idx on player_claims (status);

-- One pending claim per user at a time.
create unique index if not exists player_claims_one_pending_per_user
  on player_claims (user_id)
  where status = 'pending';

-- One pending claim per player at a time.
create unique index if not exists player_claims_one_pending_per_player
  on player_claims (player_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table player_claims enable row level security;

drop policy if exists "player_claims_read"   on player_claims;
drop policy if exists "player_claims_insert" on player_claims;
drop policy if exists "player_claims_update" on player_claims;
drop policy if exists "player_claims_delete" on player_claims;

-- Read: own rows or admin.
create policy "player_claims_read"
on player_claims for select
using (
  is_admin_user() or user_id = auth.uid()
);

-- Insert: must be the calling user, must not already be linked to a player,
-- pending status only, and the target player must not already be claimed.
create policy "player_claims_insert"
on player_claims for insert
with check (
  auth.uid() is not null
  and user_id = auth.uid()
  and status = 'pending'
  and not exists (
    select 1 from players where auth_user_id = auth.uid()
  )
  and not exists (
    select 1 from players p
     where p.id = player_id and p.auth_user_id is not null
  )
);

-- Update: admin can resolve any claim; users can cancel their own pending claim.
create policy "player_claims_update"
on player_claims for update
using (
  is_admin_user()
  or (user_id = auth.uid() and status = 'pending')
)
with check (
  is_admin_user()
  or (user_id = auth.uid() and status in ('pending', 'cancelled'))
);

-- Delete: admin only (keeps history). Users cancel via update.
create policy "player_claims_delete"
on player_claims for delete
using (is_admin_user());

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_claim(claim_id uuid, promote_admin boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c player_claims%rowtype;
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  select * into c from player_claims where id = claim_id for update;
  if not found or c.status <> 'pending' then
    raise exception 'Claim not found or already decided';
  end if;
  update players
     set auth_user_id = c.user_id,
         is_admin     = case when promote_admin then true else is_admin end
   where id = c.player_id;
  update player_claims
     set status      = 'approved',
         decided_at  = now(),
         decided_by  = auth.uid()
   where id = claim_id;
end;
$$;

create or replace function public.admin_reject_claim(claim_id uuid, note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  update player_claims
     set status      = 'rejected',
         decided_at  = now(),
         decided_by  = auth.uid(),
         message     = coalesce(note, message)
   where id = claim_id
     and status = 'pending';
  if not found then
    raise exception 'Claim not found or already decided';
  end if;
end;
$$;

create or replace function public.admin_link_player(player_id_arg text, user_id_arg uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  update players set auth_user_id = user_id_arg where id = player_id_arg;
end;
$$;

create or replace function public.admin_unlink_player(player_id_arg text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  update players set auth_user_id = null where id = player_id_arg;
end;
$$;

create or replace function public.admin_set_admin_flag(player_id_arg text, make_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Not authorised';
  end if;
  update players set is_admin = make_admin where id = player_id_arg;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read helpers for the admin panel (PostgREST can't see auth.users directly)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_auth_users()
returns table (id uuid, email text, created_at timestamptz, linked_player_id text, linked_player_name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email::text, u.created_at,
         p.id   as linked_player_id,
         p.name as linked_player_name
    from auth.users u
    left join players p on p.auth_user_id = u.id
   where is_admin_user()
   order by u.created_at desc;
$$;

create or replace function public.admin_list_claims_with_email()
returns table (
  id uuid,
  user_id uuid,
  user_email text,
  player_id text,
  player_name text,
  status text,
  message text,
  created_at timestamptz,
  decided_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.user_id, u.email::text as user_email, c.player_id, p.name as player_name,
         c.status, c.message, c.created_at, c.decided_at
    from player_claims c
    join auth.users u on u.id = c.user_id
    join players p    on p.id = c.player_id
   where is_admin_user()
   order by case c.status when 'pending' then 0 else 1 end, c.created_at desc;
$$;

grant execute on function public.admin_approve_claim(uuid, boolean) to authenticated;
grant execute on function public.admin_reject_claim(uuid, text)     to authenticated;
grant execute on function public.admin_link_player(text, uuid)      to authenticated;
grant execute on function public.admin_unlink_player(text)          to authenticated;
grant execute on function public.admin_set_admin_flag(text, boolean) to authenticated;
grant execute on function public.admin_list_auth_users()            to authenticated;
grant execute on function public.admin_list_claims_with_email()     to authenticated;
