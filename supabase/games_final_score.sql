-- Final score (Caracrew goals first, opponent second — matches display "us – them")
alter table games
add column if not exists home_score int,
add column if not exists away_score int;
