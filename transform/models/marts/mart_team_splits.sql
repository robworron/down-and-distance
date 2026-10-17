-- depends_on: {{ ref('situations') }}
-- A team's record in every situation, per season and season type: one row
-- per (team, season, season_type, situation_key, situation_value), e.g. BUF,
-- 2024, REG, wind, 15_plus. The SQL is generated from the situation registry
-- (seeds/situations.csv), so a new situation is a CSV row, not a code change.
--
-- Sums and counts only, never averages ("additive measures"). A rate is
-- computed when it's read: win % over 2022-2024 is the three seasons' wins
-- (plus half the ties) over their games, which is right however many games
-- each season had. Averaging three per-season win %s would weigh a 6-game
-- sample the same as a 17-game one.

{%- set situations = situation_registry() %}

with

-- Only played games count towards a record.
finished as (
    select * from {{ ref('team_games') }}
    where is_finished
),

-- Unpivot: each team-game becomes one row per situation, holding that
-- situation's key, level and this game's value as text (wide to long again,
-- as in 2.1). CROSS JOIN LATERAL runs the VALUES list once per team-game
-- row, and LATERAL lets the list read that row's columns (tg.venue ...).
-- The list is written by the Jinja loop, one line per registry row:
--   ('venue', 'team', tg.venue::text), ('wind', 'game', tg.wind_bucket::text), ...
-- ::text makes every value one type, so true/false (primetime) can share
-- a column with 'home'/'away'.
unpivoted as (
    select
        tg.*,
        s.situation_key,
        s.situation_level,
        s.situation_value
    from finished as tg
    cross join lateral (
        values
        {%- for s in situations %}
            ('{{ s["key"] }}', '{{ s["level"] }}', tg.{{ s["column_name"] }}::text){{ "," if not loop.last }}
        {%- endfor %}
    ) as s (situation_key, situation_level, situation_value)
    -- A NULL value means the situation doesn't apply (no weather under a
    -- closed roof) or isn't known (1999 kickoff times), so the game sits
    -- out of that one situation only.
    where s.situation_value is not null
)

select
    team,
    season,
    season_type,
    situation_key,
    -- game: the same for both teams (wind); team: can differ (venue).
    -- League win % is only meaningful for team-level situations.
    situation_level,
    situation_value,

    -- Results. count(*) FILTER (WHERE ...) counts only the rows that pass
    -- the condition: a COUNT with its own WHERE. Win % = (wins + ties / 2) / games.
    count(*)::integer                                     as games,
    count(*) filter (where result = 'win')::integer       as wins,
    count(*) filter (where result = 'loss')::integer      as losses,
    count(*) filter (where result = 'tie')::integer       as ties,
    sum(points_for)::integer                              as points_for,
    sum(points_against)::integer                          as points_against,

    -- Against the spread. count(column) skips NULLs, so ats_games counts
    -- games with a line. Cover % = ats_covers / (ats_games - ats_pushes).
    count(ats_result)::integer                            as ats_games,
    count(*) filter (where ats_result = 'cover')::integer as ats_covers,
    count(*) filter (where ats_result = 'push')::integer  as ats_pushes,

    -- Over/under: over % = overs / (ou_games - ou_pushes).
    count(total_result)::integer                          as ou_games,
    count(*) filter (where total_result = 'over')::integer  as overs,
    count(*) filter (where total_result = 'under')::integer as unders,
    count(*) filter (where total_result = 'push')::integer  as ou_pushes,

    -- Play-by-play (2016 on). stats_games counts the games that have it, and
    -- is the denominator for per-game stats. Before 2016 it's 0 and the sums
    -- are NULL: no data, not zero plays. SUM ignores NULLs, so a 2014-2017
    -- range sums the 2016-17 stats over their 2016-17 stats_games.
    count(plays)::integer                                 as stats_games,
    sum(plays)::integer                                   as plays,
    sum(yards)::integer                                   as yards,
    sum(dropbacks)::integer                               as dropbacks,
    sum(rushes)::integer                                  as rushes,
    sum(epa)                                              as epa,
    sum(successes)::integer                               as successes,
    sum(def_plays)::integer                               as def_plays,
    sum(def_yards)::integer                               as def_yards,
    sum(def_dropbacks)::integer                           as def_dropbacks,
    sum(def_rushes)::integer                              as def_rushes,
    sum(def_epa)                                          as def_epa,
    sum(def_successes)::integer                           as def_successes,
    sum(turnovers)::integer                               as turnovers,
    sum(takeaways)::integer                               as takeaways,
    sum(sacks)::integer                                   as sacks,
    sum(sacks_taken)::integer                             as sacks_taken,
    sum(third_down_attempts)::integer                     as third_down_attempts,
    sum(third_down_conversions)::integer                  as third_down_conversions,
    sum(red_zone_trips)::integer                          as red_zone_trips,
    sum(red_zone_tds)::integer                            as red_zone_tds,
    sum(penalties)::integer                               as penalties,
    sum(penalty_yards)::integer                           as penalty_yards
from unpivoted
-- One output row per group. situation_level depends only on the key, so
-- grouping by it doesn't split anything.
group by team, season, season_type, situation_key, situation_level, situation_value
