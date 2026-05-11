-- Multi-season support: run once on your Supabase project.
-- 1) Tags every game and opponent_strength row with a season slug (2526 = 25-26, 2627 = 26-27).
-- 2) Lets the app and sync scripts scope queries to the active season.

-- --- games ---
alter table games
  add column if not exists season_slug text not null default '2526';

update games set season_slug = '2526' where season_slug is null or season_slug = '';

create index if not exists games_season_slug_game_date_idx
  on games (season_slug, game_date);

comment on column games.season_slug is 'Season key: 2526 (25-26), 2627 (26-27), etc.';

-- --- opponent_strength: composite key (season × LZV team id) ---
alter table opponent_strength
  add column if not exists season_slug text not null default '2526';

update opponent_strength set season_slug = '2526' where season_slug is null or season_slug = '';

alter table opponent_strength drop constraint if exists opponent_strength_pkey;

alter table opponent_strength
  add primary key (season_slug, team_id);

create index if not exists opponent_strength_season_idx
  on opponent_strength (season_slug);

comment on column opponent_strength.season_slug is 'Same slug as games.season_slug; palmares sync writes per season.';
