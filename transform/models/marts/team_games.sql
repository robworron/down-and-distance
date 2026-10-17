-- Two rows per game since 1999: one from each team's point of view.
-- "Long format": a team's whole history is now WHERE team = 'BUF', no matter
-- whether it was home or away. Carries team-level fields (points for/against,
-- result, rest, spread from this team's side) plus every game-level situation
-- from games, so the splits marts need only this one table.

with

games as (
    select * from {{ ref('games') }}
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
-- Join back to games for the columns both rows share.
join games as g on g.game_id = s.game_id
