-- Deny attendance inserts/updates/deletes for preview season 2627 (including admins).
-- Matches SEASON_SLUGS_PREVIEW_LOCKED in src/seasons.js.
-- Run after auth_ownership.sql (replaces policy "attendance_owner_write").

drop policy if exists "attendance_owner_write" on attendance;

create policy "attendance_owner_write"
on attendance for all
using (
  exists (
    select 1 from games g
    where g.id = attendance.game_id
      and coalesce(g.season_slug, '') <> '2627'
  )
  and (
    is_admin_user()
    or (auth.uid() is not null and player_id = current_player_id())
  )
)
with check (
  exists (
    select 1 from games g
    where g.id = game_id
      and coalesce(g.season_slug, '') <> '2627'
  )
  and (
    is_admin_user()
    or (auth.uid() is not null and player_id = current_player_id())
  )
);
