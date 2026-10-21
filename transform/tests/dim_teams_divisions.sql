-- dim_teams holds today's league exactly: 32 teams, 8 divisions of 4, two
-- conferences of 16, and every colour a six-digit hex code. Returns a row
-- for anything that doesn't hold, so an empty result passes.

with

-- Each division's size: anything but 4 is wrong.
divisions as (
    select division, count(*) as teams
    from {{ ref('dim_teams') }}
    group by division
),

-- The overall counts: 32 teams in 8 divisions.
totals as (
    select count(*) as teams, count(distinct division) as divisions
    from {{ ref('dim_teams') }}
)

select 'division ' || division || ' has ' || teams || ' teams' as problem
from divisions
where teams <> 4

union all

select teams || ' teams in ' || divisions || ' divisions'
from totals
where teams <> 32 or divisions <> 8

union all

-- ~ is Postgres's regular-expression match: '#' then exactly six hex digits.
select team_abbr || ' has a colour that is not #RRGGBB'
from {{ ref('dim_teams') }}
where team_color !~ '^#[0-9A-F]{6}$' or team_color2 !~ '^#[0-9A-F]{6}$'
