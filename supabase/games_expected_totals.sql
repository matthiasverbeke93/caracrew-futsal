alter table games
add column if not exists expected_goals int,
add column if not exists expected_assists int;
