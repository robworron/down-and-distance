-- One row per game since 1999: raw.schedules cleaned.
--   - nflverse's known wrong values replaced (seed schedule_corrections)
--   - types fixed: text dates -> date, 0/1 -> boolean, bigint -> integer
--   - kickoff built as Eastern wall-clock time and as a UTC instant
--   - relocated teams' codes mapped to today's franchise (OAK -> LV, ...)

with

schedules as (
    select * from {{ source('raw', 'schedules') }}
),

-- The corrections seed is "long": one row per (game, column). Pivot it to one
-- row per game, with a value column and a "was it corrected?" flag per column.
-- The flag matters because a correction can be to NULL (Madrid's unknown roof),
-- which a plain coalesce(corrected, original) would wrongly skip.
corrections as (
    select
        game_id,
        max(corrected_value) filter (where column_name = 'gametime')   as gametime,
        max(corrected_value) filter (where column_name = 'stadium_id') as stadium_id,
        max(corrected_value) filter (where column_name = 'roof')       as roof,
        bool_or(column_name = 'gametime')   as fixes_gametime,
        bool_or(column_name = 'stadium_id') as fixes_stadium_id,
        bool_or(column_name = 'roof')       as fixes_roof
    from {{ ref('schedule_corrections') }}
    group by game_id
),

-- Apply the corrections first, so every column below sees the fixed values.
corrected as (
    select
        s.*,
        case when c.fixes_gametime   then c.gametime   else s.gametime   end as gametime_fixed,
        case when c.fixes_stadium_id then c.stadium_id else s.stadium_id end as stadium_id_fixed,
        case when c.fixes_roof       then c.roof       else s.roof       end as roof_fixed
    from schedules as s
    -- LEFT JOIN: most games have no correction and must still come through.
    left join corrections as c on c.game_id = s.game_id
)

select
    -- Keys and when
    game_id,
    season::integer                                  as season,
    game_type,                                       -- REG, WC, DIV, CON, SB
    week::integer                                    as week,
    gameday::date                                    as gameday,
    weekday,
    gametime_fixed                                   as gametime,   -- 'HH:MM', US Eastern
    -- date + time gives a timestamp with no zone: the Eastern wall-clock kickoff.
    gameday::date + gametime_fixed::time             as kickoff_et,
    -- AT TIME ZONE on a zone-less timestamp says "this clock time is in New York"
    -- and returns the actual instant (timestamptz). The IANA zone name handles
    -- daylight saving time, so 1 pm ET is 17:00 UTC in September, 18:00 in December.
    (gameday::date + gametime_fixed::time) at time zone 'America/New_York' as kickoff_utc,

    -- Teams, as today's franchise codes, plus the code nflverse listed
    {{ current_team('home_team') }}                  as home_team,
    {{ current_team('away_team') }}                  as away_team,
    home_team                                        as home_team_listed,
    away_team                                        as away_team_listed,

    -- Result (NULL until the game is played)
    home_score::integer                              as home_score,
    away_score::integer                              as away_score,
    result::integer                                  as result,     -- home_score - away_score
    total::integer                                   as total,      -- home_score + away_score
    overtime = 1                                     as overtime,

    -- Venue
    location,                                        -- 'Home' or 'Neutral'
    stadium_id_fixed                                 as stadium_id,
    stadium                                          as stadium_listed,
    -- '' and stray spaces (e.g. 'grass ') become clean values or NULL.
    nullif(trim(roof_fixed), '')                     as roof,       -- outdoors / dome / open / closed
    nullif(trim(surface), '')                        as surface,
    temp::integer                                    as nflverse_temp_f,
    wind::integer                                    as nflverse_wind_mph,

    -- Rest and matchup
    home_rest::integer                               as home_rest,  -- days since the team's last game
    away_rest::integer                               as away_rest,
    div_game = 1                                     as div_game,

    -- Betting lines. spread_line is the home team's expected margin:
    -- positive means the home team is favoured.
    spread_line::numeric(4, 1)                       as spread_line,
    total_line::numeric(4, 1)                        as total_line,
    home_moneyline::integer                          as home_moneyline,
    away_moneyline::integer                          as away_moneyline,
    home_spread_odds::integer                        as home_spread_odds,
    away_spread_odds::integer                        as away_spread_odds,
    over_odds::integer                               as over_odds,
    under_odds::integer                              as under_odds,

    -- People
    home_qb_id,
    away_qb_id,
    home_qb_name,
    away_qb_name,
    home_coach,
    away_coach,
    referee,

    -- Other sites' ids, for linking out
    old_game_id,
    pfr,
    espn
from corrected
