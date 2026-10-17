-- Two rows per game since 1999: one from each team's point of view.
-- "Long format": a team's whole history is now WHERE team = 'BUF', no matter
-- whether it was home or away. Carries team-level fields (points for/against,
-- result, rest, spread from this team's side, travel and body clock) plus
-- every game-level situation from games, so the splits marts need only this
-- one table.

with

games as (
    select * from {{ ref('games') }}
),

team_seasons as (
    select * from {{ ref('team_seasons') }}
),

stadiums as (
    select * from {{ ref('stadiums') }}
),

-- Each game twice. Branch 1 is the home team's view, branch 2 the away team's:
-- the same columns with home and away swapped. UNION ALL keeps both rows
-- (UNION would try to de-duplicate, which is wasted work here).
sides as (
    select
        game_id,
        home_team     as team,
        away_team     as opponent,
        true          as is_home,
        home_score    as points_for,
        away_score    as points_against,
        home_rest     as rest_days,
        away_rest     as opponent_rest_days,
        -- spread_line is the home team's expected margin (+3 = home favoured
        -- by 3). Betting convention writes a favourite's spread as negative,
        -- so the home team's spread is minus spread_line...
        -spread_line  as team_spread
    from games

    union all

    select
        game_id,
        away_team,
        home_team,
        false,
        away_score,
        home_score,
        away_rest,
        home_rest,
        spread_line   -- ...and the away team's is spread_line as published.
    from games
),

-- Travel, step 1 (2.7): put each team-game next to the team's home that
-- season (team_seasons) and the stadium the game is played in.
travel_inputs as (
    select
        s.game_id,
        s.team,
        ts.home_stadium_id,
        ts.home_timezone,
        ts.home_latitude,
        ts.home_longitude,
        venue.timezone     as venue_timezone,
        venue.latitude     as venue_latitude,
        venue.longitude    as venue_longitude,
        g.kickoff_utc,
        -- The instant to read both clocks at: kickoff. 1999 has no kickoff
        -- times, so it uses 1 pm ET on the game day. Clocks only change in
        -- the small hours, so any daytime instant gives the same answer.
        coalesce(
            g.kickoff_utc,
            (g.gameday + time '13:00') at time zone 'America/New_York'
        )                  as clock_instant
    from sides as s
    join games as g on g.game_id = s.game_id
    join team_seasons as ts on ts.team = s.team and ts.season = g.season
    join stadiums as venue on venue.stadium_id = g.stadium_id
),

-- Step 2: compare the two places: the distance between them, how far apart
-- their clocks were at kickoff, and kickoff time on the team's home clock.
travel_measures as (
    select
        game_id,
        team,
        home_stadium_id,
        round({{ haversine_miles('home_latitude', 'home_longitude', 'venue_latitude', 'venue_longitude') }})::integer
                           as travel_miles,
        -- Venue's UTC offset minus home's, e.g. Pittsburgh (-4) minus
        -- Seattle (-7) = +3 in September. Both offsets are read at the same
        -- instant, so daylight saving time is handled: Arizona (-7 all year)
        -- minus Los Angeles is 0 in October (-7) but +1 in December (-8).
        {{ utc_offset_hours('clock_instant', 'venue_timezone') }}
            - {{ utc_offset_hours('clock_instant', 'home_timezone') }}
                           as clock_gap_hours,
        -- The body clock: kickoff as the time on the team's home clock.
        -- NULL in 1999 (no kickoff times).
        (kickoff_utc at time zone home_timezone)::time
                           as body_clock_time
    from travel_inputs
),

-- Step 3: the clock gap as signed time zones crossed. Wrapping it into
-- -12..+12 matters only across the date line: Melbourne's clock is 17 hours
-- ahead of LA's, which is the same time of day as 7 hours behind, and that
-- shorter way round is the shift the body has to make (and the way the
-- team flies).
travel as (
    select
        game_id,
        team,
        home_stadium_id,
        travel_miles,
        (clock_gap_hours - 24 * round(clock_gap_hours / 24))::integer
                           as time_zone_shift,
        body_clock_time
    from travel_measures
)

select
    -- Identity
    s.game_id,
    g.season,
    g.week,
    g.game_type,
    g.is_playoff,
    g.gameday,
    g.kickoff_et,
    g.kickoff_utc,
    s.team,
    s.opponent,

    -- Venue: at a neutral site neither team is home, whatever the designation.
    s.is_home,
    case
        when g.is_neutral_site then 'neutral'
        when s.is_home         then 'home'
        else 'away'
    end                                         as venue,

    -- Result (NULL until played)
    g.is_finished,
    s.points_for,
    s.points_against,
    s.points_for - s.points_against             as margin,
    case
        when s.points_for > s.points_against then 'win'
        when s.points_for < s.points_against then 'loss'
        when s.points_for = s.points_against then 'tie'
    end                                         as result,     -- NULL scores fall through to NULL
    g.overtime,

    -- Rest: days since each team's previous game (week 1 counts as 7).
    -- 5 days or less is 'short', including Friday games after a Sunday.
    s.rest_days,
    s.rest_days - s.opponent_rest_days          as rest_diff,  -- positive = more rested than the opponent
    case
        when s.rest_days is null then null
        when s.rest_days <= 5    then 'short'
        when s.rest_days <= 8    then 'normal'
        when s.rest_days <= 12   then 'extra'
        else 'bye'
    end                                         as rest_bucket,

    -- Spread from this team's side: negative = favourite, e.g. -3.5.
    s.team_spread,
    -- Spread role (Rob's choice, 2.6): five tiers at the key numbers 3 and 7.
    -- Checked top to bottom: -7 or more favoured, then -3 to -6.5, then
    -- anything under 3 either way, then +3 to +6.5, then +7 or more.
    case
        when s.team_spread is null then null
        when s.team_spread <= -7   then 'big_favourite'
        when s.team_spread <= -3   then 'favourite'
        when s.team_spread < 3     then 'pickem'
        when s.team_spread < 7     then 'underdog'
        else 'big_underdog'
    end                                         as spread_role,
    g.total_line,

    -- Travel and body clock (2.7), from this team's home stadium that season.
    -- A home game at the home stadium is 0 miles and 0 zones.
    t.home_stadium_id,
    t.travel_miles,
    t.time_zone_shift,                          -- + = clock ahead of home (travelled east), - = west
    case
        when t.time_zone_shift is null             then null
        when t.time_zone_shift = 0                 then 'none'
        when t.time_zone_shift between 1 and 3     then 'eastbound_1_3'
        when t.time_zone_shift between -3 and -1   then 'westbound_1_3'
        else 'long_haul_4_plus'                    -- 4+ either way: almost all trips to Europe
    end                                         as time_zone_travel,
    t.body_clock_time,
    -- Body clock buckets (Rob's choice, 2.7), on every row: for the home
    -- team it's simply local time. Seattle at 1 pm ET reads 10:00, morning.
    case
        when t.body_clock_time is null          then null
        when t.body_clock_time < time '12:00'   then 'morning'
        when t.body_clock_time < time '16:00'   then 'afternoon'
        when t.body_clock_time < time '19:00'   then 'late_afternoon'
        else 'night'
    end                                         as body_clock,

    -- Game-level situations, the same for both teams
    g.stadium_id,
    g.is_neutral_site,
    g.roof_type,
    g.surface_type,
    g.is_open_air,
    g.temperature_f,
    g.wind_mph,
    g.precipitation_in,
    g.snowfall_in,
    g.temperature_bucket,
    g.wind_bucket,
    g.precipitation_bucket,
    g.time_slot,
    g.is_primetime,
    g.opponent_type
from sides as s
-- Join back to games for the columns both rows share, and to travel for
-- this team's trip.
join games as g on g.game_id = s.game_id
join travel as t on t.game_id = s.game_id and t.team = s.team
