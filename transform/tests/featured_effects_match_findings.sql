-- The featured situations' league-wide effects, as docs/findings.md reports
-- them (step 0.36), recomputed from mart_league_splits and pinned (step 0.48).
-- This week shows these numbers (web/lib/effects.ts computes them the same
-- way), so a rebuild that changed one would leave the site disagreeing with
-- the findings. Returns a row for every effect that differs at one decimal,
-- so an empty result passes.
--
-- Weather and roof: the season-adjusted total, i.e. each game's points minus
-- that season's average game, averaged over the value's games, regular
-- seasons 1999-2025. Rest advantage: the plain win % and margin per game of
-- the side with 3+ days less rest.

with

expected (situation_key, situation_value, metric, value) as (
    values
        ('precipitation', 'heavy_rain', 'points vs season', -5.1),
        ('precipitation', 'light_rain', 'points vs season', -2.8),
        ('precipitation', 'snow', 'points vs season', -1.2),
        ('wind', '15_plus', 'points vs season', -3.8),
        ('wind', '10_to_14', 'points vs season', -1.9),
        ('roof', 'dome', 'points vs season', 2.8),
        ('rest_advantage', 'less_rest', 'win %', 48.4),
        ('rest_advantage', 'less_rest', 'margin per game', -1.0)
),

splits as (
    select *
    from {{ ref('mart_league_splits') }}
    where season_type = 'REG' and season between 1999 and 2025
),

-- Each season's average game total. The venue rows hold every game, counted
-- once per team, so points over team-games is points per game.
season_mean as (
    select season, sum(points_for + points_against)::numeric / sum(games) as mean_total
    from splits
    where situation_key = 'venue'
    group by season
),

-- Per value: games and total points per season, halved because each game
-- appears once per team, then each season's deviation from its mean.
points_effects as (
    select
        s.situation_key,
        s.situation_value,
        'points vs season' as metric,
        sum((s.points_for + s.points_against) / 2.0 - (s.games / 2.0) * m.mean_total)
            / sum(s.games / 2.0) as value
    from splits as s
    join season_mean as m using (season)
    where s.situation_key in ('precipitation', 'wind', 'roof')
    group by s.situation_key, s.situation_value
),

rest_effects as (
    select situation_key, situation_value, 'win %' as metric,
           100.0 * (sum(wins) + 0.5 * sum(ties)) / sum(games) as value
    from splits
    where situation_key = 'rest_advantage'
    group by situation_key, situation_value
    union all
    select situation_key, situation_value, 'margin per game',
           sum(points_for - points_against)::numeric / sum(games)
    from splits
    where situation_key = 'rest_advantage'
    group by situation_key, situation_value
),

actual as (
    select * from points_effects
    union all
    select * from rest_effects
)

select e.situation_key, e.situation_value, e.metric, e.value as expected, round(a.value, 1) as actual
from expected as e
left join actual as a using (situation_key, situation_value, metric)
where round(a.value, 1) is distinct from e.value
