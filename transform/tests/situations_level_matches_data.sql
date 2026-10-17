-- depends_on: {{ ref('situations') }}
-- depends_on: {{ ref('team_games') }}
-- A game-level situation is the same for both teams, so the two rows of
-- every game must carry the same value (or both NULL). Labelling a
-- team-level situation such as venue as 'game' makes this fail. Generated
-- from the registry: one check per game-level situation.
-- Returns each (situation, game) where the two rows differ.

{%- set situations = situation_registry() %}
{%- for s in situations if s["level"] == "game" %}

select '{{ s["key"] }}' as key, game_id
from {{ ref('team_games') }}
group by game_id
-- COUNT(DISTINCT col) ignores NULLs: 2 means two different values;
-- COUNT(col) = 1 means one row has a value and the other is NULL.
having count(distinct {{ s["column_name"] }}) > 1
    or count({{ s["column_name"] }}) = 1
{% if not loop.last %}union all{% endif %}
{%- endfor %}
