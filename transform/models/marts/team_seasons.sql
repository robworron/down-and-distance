-- One row per team per season: the stadium the team called home.
-- Home is the stadium where the team played most of its non-neutral home
-- games that season. For nearly every team-season that's its only home
-- stadium. The exceptions: the 2005 Saints after Hurricane Katrina (4 games
-- in Baton Rouge, 3 in San Antonio, 1 at Giants Stadium), the Bills' one
-- Toronto game a year in 2009-12, and the 2010 Vikings, who played one game
-- at the University of Minnesota's stadium after the Metrodome roof fell in.
-- team_games measures every game's travel from this stadium (step 0.27).

with

games as (
    select * from {{ ref('games') }}
),

stadiums as (
    select * from {{ ref('stadiums') }}
),

-- Step 1: count each team's home games at each stadium, per season.
-- Neutral-site games are left out: there "home" is only a designation.
home_games as (
    select
        season,
        home_team          as team,
        stadium_id,
        count(*)           as home_games,
        max(gameday)       as last_home_game
    from games
    where not is_neutral_site
    group by season, home_team, stadium_id
),

-- Step 2: rank the stadiums within each team-season. ROW_NUMBER numbers the
-- rows of each partition (one team's season) in the ORDER BY's order, so the
-- stadium with the most games gets 1; a tie would go to the latest one used.
ranked as (
    select
        *,
        row_number() over (
            partition by team, season
            order by home_games desc, last_home_game desc
        )                  as stadium_rank
    from home_games
)

-- Step 3: keep the top stadium and attach where it is.
select
    r.team,
    r.season,
    r.stadium_id           as home_stadium_id,
    s.name                 as home_stadium_name,
    s.timezone             as home_timezone,
    s.latitude             as home_latitude,
    s.longitude            as home_longitude,
    r.home_games           -- non-neutral home games played there that season
from ranked as r
join stadiums as s on s.stadium_id = r.stadium_id
where r.stadium_rank = 1
