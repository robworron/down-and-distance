-- One row per game since 1999, with every game-level situation as a bucket.
-- Joins the cleaned schedule to its stadium (seed) and weather, then labels:
-- roof, surface, temperature, wind, precipitation, time slot, primetime,
-- opponent type and neutral site. Rules: docs/decisions.md (Phase 2 weather
-- rules, step 2.5 buckets).

with

schedules as (
    select * from {{ ref('stg_schedules') }}
),

stadiums as (
    select * from {{ ref('stadiums') }}
),

weather as (
    select * from {{ ref('stg_game_weather') }}
),

teams as (
    select * from {{ ref('stg_teams') }}
),

-- Step 1: join the sources and decide the two facts the buckets depend on.
joined as (
    select
        s.*,
        st.name             as stadium_name,
        st.roof             as stadium_roof,      -- the building: outdoors / dome / retractable
        st.surface          as stadium_surface,

        -- Weather applies only to games played in the open (decisions.md rule 2):
        -- the game's own roof says outdoors/open, OR the stadium has no roof at
        -- all (catches nflverse's 'dome' label on the roofless Melbourne Cricket
        -- Ground). coalesce(..., false): a NULL roof (unknown) is not "open".
        coalesce(s.roof in ('outdoors', 'open'), false)
            or st.roof = 'outdoors'                  as is_open_air,

        w.temperature_avg_f,
        w.wind_max_mph,
        w.precipitation_total_in,
        w.snowfall_total_in,

        -- Conferences come from today's alignment, with one historical fix:
        -- Seattle was in the AFC West until the 2002 realignment, the only
        -- team that changed conference then.
        case when s.home_team = 'SEA' and s.season < 2002 then 'AFC' else home_t.conference end as home_conference,
        case when s.away_team = 'SEA' and s.season < 2002 then 'AFC' else away_t.conference end as away_conference
    from schedules as s
    -- Inner join: every game's stadium is in the seed (tested in staging).
    join stadiums as st on st.stadium_id = s.stadium_id
    -- Left joins: 1999 and upcoming games have no weather row, and must stay.
    left join weather as w on w.game_id = s.game_id
    join teams as home_t on home_t.team_abbr = s.home_team
    join teams as away_t on away_t.team_abbr = s.away_team
),

-- Step 2: weather values only for open-air games. Closed-roof games keep their
-- row but get NULLs, so they're neither "cold" nor "windy", nor dropped.
-- Temperature and wind are rounded to whole numbers before bucketing, so the
-- labels (e.g. "33-50") mean what they say: 32.4 °F counts as 32.
open_air_weather as (
    select
        *,
        case when is_open_air then round(temperature_avg_f::numeric) end as temperature_f,
        case when is_open_air then round(wind_max_mph::numeric)      end as wind_mph,
        case when is_open_air then precipitation_total_in            end as precipitation_in,
        case when is_open_air then snowfall_total_in                 end as snowfall_in,
        extract(isodow from gameday)::integer                            as day_of_week,  -- 1 Mon .. 7 Sun
        kickoff_et::time                                                 as kickoff_time_et
    from joined
)

select
    -- Identity and timing
    game_id,
    season,
    week,
    game_type,
    game_type <> 'REG'                               as is_playoff,
    gameday,
    weekday,
    kickoff_et,
    kickoff_utc,

    -- Teams and result
    home_team,
    away_team,
    home_score,
    away_score,
    home_score is not null                           as is_finished,
    overtime,
    home_rest,
    away_rest,

    -- Lines (spread_line: the home team's expected margin; positive = home favoured)
    spread_line,
    total_line,

    -- Venue
    stadium_id,
    stadium_name,
    location = 'Neutral'                             as is_neutral_site,

    -- Roof: the building's roof type, plus the game's own state for retractable
    -- roofs. Toronto's retractable roof was always shut, and nflverse lists those
    -- games as 'dome', so 'dome' on a retractable roof means closed.
    -- An unknown state (upcoming games; Madrid 2025) stays NULL.
    case
        when stadium_roof = 'dome'     then 'dome'
        when stadium_roof = 'outdoors' then 'outdoors'
        when roof in ('open', 'outdoors') then 'retractable_open'
        when roof in ('closed', 'dome')   then 'retractable_closed'
    end                                              as roof_type,

    -- Surface: the game's own surface, or the stadium's usual one when blank.
    -- Dessograss is natural grass stitched with synthetic fibres: grass.
    case
        when coalesce(surface, stadium_surface) in ('grass', 'dessograss') then 'grass'
        else 'turf'
    end                                              as surface_type,

    -- Weather (game window, kickoff to kickoff + 3 h; NULL unless open air)
    is_open_air,
    temperature_f,
    wind_mph,
    precipitation_in,
    snowfall_in,

    -- CASE checks its WHEN branches top to bottom and stops at the first true
    -- one, so each branch only needs its upper bound.
    case
        when temperature_f is null then null
        when temperature_f <= 32   then '32_or_below'
        when temperature_f <= 50   then '33_to_50'
        when temperature_f <= 79   then '51_to_79'
        else '80_or_above'
    end                                              as temperature_bucket,

    case
        when wind_mph is null then null
        when wind_mph < 10    then 'under_10'
        when wind_mph <= 14   then '10_to_14'
        else '15_plus'
    end                                              as wind_bucket,

    -- Precipitation (Rob's choice, 2.5): snow first, because Open-Meteo's
    -- precipitation includes melted snow, so a snow game has both totals > 0.
    -- Model amounts are smoothed, so only the intensity is trusted:
    -- under 0.01 in is a trace and counts as dry.
    case
        when precipitation_in is null or snowfall_in is null then null
        when snowfall_in > 0         then 'snow'
        when precipitation_in >= 0.10 then 'heavy_rain'
        when precipitation_in >= 0.01 then 'light_rain'
        else 'none'
    end                                              as precipitation_bucket,

    -- Time slot, from the Eastern kickoff (NULL for 1999: no kickoff times).
    -- Thanksgiving afternoons, 9:30 am international games, holiday games and
    -- Friday/Tuesday/Wednesday games all fall through to 'other'.
    case
        when kickoff_et is null then null
        when day_of_week = 4 and kickoff_time_et >= time '19:00' then 'tnf'
        when day_of_week = 7 and kickoff_time_et >= time '19:00' then 'snf'
        when day_of_week = 7 and kickoff_time_et >= time '16:00' then 'sunday_late'
        when day_of_week = 7 and kickoff_time_et >= time '12:00' then 'sunday_early'
        when day_of_week = 1 and kickoff_time_et >= time '19:00' then 'mnf'
        when day_of_week = 6 then 'saturday'
        else 'other'
    end                                              as time_slot,
    kickoff_time_et >= time '19:00'                  as is_primetime,

    -- Opponent type: nflverse's div_game knows each era's divisions;
    -- otherwise compare conferences.
    case
        when div_game                          then 'divisional'
        when home_conference = away_conference then 'conference'
        else 'non_conference'
    end                                              as opponent_type,
    div_game
from open_air_weather
