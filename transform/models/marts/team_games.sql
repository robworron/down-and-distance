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

stats as (
    select * from {{ ref('team_game_stats') }}
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

-- Travel (step 0.27), step 1: put each team-game next to the team's home that
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
),

-- Every column of a team-game row, built from the pieces above. The form
-- features (step 0.29) below look across these rows, so they come after.
team_rows as (
    select
        -- Identity
        s.game_id,
        g.season,
        g.week,
        g.game_type,
        g.is_playoff,
        -- Regular season or playoffs (step 0.31): the split marts keep them apart.
        case when g.is_playoff then 'POST' else 'REG' end
                                                    as season_type,
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
        -- Rest advantage (Rob's choice, step 0.39): rest days against the opponent's.
        -- A gap of 1-2 days (e.g. a Monday-night team against a Sunday team)
        -- counts as even; 3+ is a Thursday game or a bye on one side.
        case
            when s.rest_days is null or s.opponent_rest_days is null then null
            when s.rest_days - s.opponent_rest_days <= -3 then 'less_rest'
            when s.rest_days - s.opponent_rest_days >= 3  then 'more_rest'
            else 'even'
        end                                         as rest_advantage,

        -- Spread from this team's side: negative = favourite, e.g. -3.5.
        s.team_spread,
        -- Spread role (Rob's choice, step 0.26): five tiers at the key numbers 3 and 7.
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
        -- Against the spread (step 0.31): margin plus the team's spread. KC won
        -- Super Bowl LVII by 3 as a 1-point underdog: 3 + 1 = 4 > 0, covered.
        -- NULL scores or a missing line fall through to NULL.
        case
            when s.points_for - s.points_against + s.team_spread > 0 then 'cover'
            when s.points_for - s.points_against + s.team_spread = 0 then 'push'
            when s.points_for - s.points_against + s.team_spread < 0 then 'no_cover'
        end                                         as ats_result,
        g.total_line,
        -- Over/under (step 0.31): both teams' points against the total line. The
        -- same for both rows of a game.
        case
            when s.points_for + s.points_against > g.total_line then 'over'
            when s.points_for + s.points_against = g.total_line then 'push'
            when s.points_for + s.points_against < g.total_line then 'under'
        end                                         as total_result,

        -- Travel and body clock (step 0.27), from this team's home stadium that season.
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
        -- Body clock buckets (Rob's choice, step 0.27), on every row: for the home
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
        g.opponent_type,

        -- Play-by-play stats (step 0.28), sums and counts from team_game_stats.
        -- NULL before 2016 and for games not yet played.
        st.plays,
        st.yards,
        st.dropbacks,
        st.rushes,
        st.epa,
        st.successes,
        st.third_down_attempts,
        st.third_down_conversions,
        st.red_zone_trips,
        st.red_zone_tds,
        st.sacks_taken,
        st.interceptions,
        st.fumbles_lost,
        st.turnovers,
        st.penalties,
        st.penalty_yards,
        st.def_plays,
        st.def_yards,
        st.def_dropbacks,
        st.def_rushes,
        st.def_epa,
        st.def_successes,
        st.sacks,
        st.takeaways
    from sides as s
    -- Join back to games for the columns both rows share, and to travel for
    -- this team's trip.
    join games as g on g.game_id = s.game_id
    join travel as t on t.game_id = s.game_id and t.team = s.team
    -- LEFT JOIN: games before 2016, or not yet played, have no play-by-play
    -- but keep their rows.
    left join stats as st on st.game_id = s.game_id and st.team = s.team
),

-- Form (step 0.29), step 1: number each team's games within the season, and label
-- its runs of identical results ("gaps and islands"). Two ROW_NUMBERs count
-- the same games two ways: all the team's games in date order, and only the
-- games with this same result. Through an unbroken run of wins both counts
-- rise by one each game, so their difference stays put; a loss or tie in
-- between makes it jump. So the difference labels each run.
form_runs as (
    select
        game_id,
        team,
        season,
        gameday,
        result,
        margin,
        venue,
        rest_bucket,
        row_number() over (partition by team, season order by gameday)        as game_number,
        row_number() over (partition by team, season order by gameday)
          - row_number() over (partition by team, season, result order by gameday)
                                                                               as result_run
    from team_rows
),

-- Step 2: the streak after each game: its place within its run, signed
-- (+ for wins, - for losses, 0 for a tie, NULL until played).
form_streaks as (
    select
        *,
        case result when 'win' then 1 when 'loss' then -1 when 'tie' then 0 end
          * row_number() over (partition by team, season, result, result_run order by gameday)
                                                                               as streak_after
    from form_runs
),

-- Step 3: the features, each describing the team ENTERING the game. Window w
-- is one team's season in date order: playoffs continue it, and it restarts
-- each season. LAG reads the previous game's value, so nothing here sees
-- this game's own result. The two running counts also read this game's rest
-- days and venue, which come from the schedule and are known before kickoff.
form as (
    select
        game_id,
        team,
        game_number,
        lag(result)       over w                                               as prev_result,
        lag(streak_after) over w                                               as streak,
        -- Rob's choice (step 0.29): a three-score loss, 17 points or more.
        lag(margin)       over w <= -17                                        as after_blowout_loss,
        -- Games since the team last rested: a bye (13+ days off, as in
        -- rest_bucket, playoff byes included) or the start of the season.
        -- The running MAX over every game up to this one finds the last.
        game_number - max(case when rest_bucket = 'bye' or game_number = 1 then game_number end)
            over (w rows between unbounded preceding and current row)          as games_since_bye,
        -- Road games in a row, this one included; 0 at home. A neutral site
        -- counts as a road game: the team isn't in its own stadium. The
        -- running MAX finds the team's latest home game (0 if none yet).
        case
            when venue = 'home' then 0
            else game_number - coalesce(
                max(case when venue = 'home' then game_number end)
                    over (w rows between unbounded preceding and current row),
                0)
        end                                                                    as consecutive_road_games
    from form_streaks
    window w as (partition by team, season order by gameday)
)

select
    r.*,
    f.game_number,
    f.prev_result,
    f.streak,
    f.after_blowout_loss,
    f.games_since_bye,
    f.consecutive_road_games
from team_rows as r
join form as f on f.game_id = r.game_id and f.team = r.team
