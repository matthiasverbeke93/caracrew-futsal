-- Per-player "actually played this fixture" flag for stats + compliance (not inferred from G/A).
-- Run in Supabase SQL editor or via migration.

alter table player_stats
add column if not exists played boolean not null default true;

comment on column player_stats.played is
  'When true, this fixture counts toward RSVP/stats compliance. Default true preserves legacy rows.';
