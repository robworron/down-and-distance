-- depends_on: {{ ref('situations') }}
-- depends_on: {{ ref('team_games') }}
-- The unpivot neither drops nor double-counts a game: for each situation,
-- season and season type, the league's totals over all of the situation's
-- values equal the finished team-games where that situation has a value,
-- counted straight from team_games. Checks games, wins, ties, points and
-- plays. The second half is generated from the registry, one SELECT per
-- situation. Returns each disagreement.

{%- set situations = situation_registry() %}

with from_splits as (
    select
        season,
        season_type,
        situation_key,
        sum(games)      as games,
        sum(wins)       as wins,
        sum(ties)       as ties,
        sum(points_for) as points_for,
        sum(plays)      as plays
    from {{ ref('mart_league_splits') }}
    group by season, season_type, situation_key
),

from_team_games as (
    {%- for s in situations %}
    select
        season,
        season_type,
        '{{ s["key"] }}' as situation_key,
        count(*)                                as games,
        count(*) filter (where result = 'win')  as wins,
        count(*) filter (where result = 'tie')  as ties,
        sum(points_for)                         as points_for,
        sum(plays)                              as plays
    from {{ ref('team_games') }}
    where is_finished and {{ s["column_name"] }} is not null
    group by season, season_type
    {% if not loop.last %}union all{% endif %}
    {%- endfor %}
)

select
    situation_key, season, season_type,
    s.games as splits_games,
    t.games as team_games_games
from from_splits as s
full join from_team_games as t using (season, season_type, situation_key)
where s.games is distinct from t.games
   or s.wins is distinct from t.wins
   or s.ties is distinct from t.ties
   or s.points_for is distinct from t.points_for
   or s.plays is distinct from t.plays
