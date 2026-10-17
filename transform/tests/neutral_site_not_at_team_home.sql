-- Catches international games filed under the home team's US stadium, as
-- nflverse did for all of 2025's (e.g. Dublin listed as Pittsburgh).
-- Returns neutral-site games played at the regular home stadium of either team
-- in the game. Fix any it finds with a stadium_id row in
-- seeds/schedule_corrections.csv.
--
-- "Either team in the game", not "any team": almost every Super Bowl, and real
-- relocations (Detroit snow games, hurricane and wildfire moves), are at some
-- OTHER team's stadium. Super Bowls are skipped entirely, because twice a team
-- has played one in its own stadium (TB in 2020, LA in 2021).

with

-- Each team's regular home stadium per season: where it played most of its
-- regular-season home games.
home_counts as (
    select
        season,
        home_team as team,
        stadium_id,
        count(*) as games
    from {{ ref('stg_schedules') }}
    where location = 'Home'
      and game_type = 'REG'
    group by season, home_team, stadium_id
),

home_stadium as (
    -- DISTINCT ON keeps the first row per (season, team) in the ORDER BY:
    -- the stadium with the most games (stadium_id breaks a tie predictably).
    select distinct on (season, team)
        season, team, stadium_id
    from home_counts
    order by season, team, games desc, stadium_id
)

select
    g.game_id,
    g.stadium_id,
    h.team as regular_home_of
from {{ ref('stg_schedules') }} as g
join home_stadium as h
  on h.season = g.season
 and h.stadium_id = g.stadium_id
 and h.team in (g.home_team, g.away_team)   -- a team playing in this game
where g.location = 'Neutral'
  and g.game_type <> 'SB'
