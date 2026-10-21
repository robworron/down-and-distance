-- Additivity: every league number is exactly the sum of the teams' numbers,
-- for every measure column of mart_league_splits (read from the database,
-- so a measure added later is checked too). Holds only because the team
-- mart stores sums and counts; averages wouldn't add up.
-- Returns each league row that disagrees, or exists on one side only.

{%- set grain = ['season', 'season_type', 'situation_key', 'situation_level', 'situation_value'] %}
{%- set measures = [] %}
{%- if execute %}
    {%- for column in adapter.get_columns_in_relation(ref('mart_league_splits')) %}
        {%- if column.name not in grain %}{% do measures.append(column.name) %}{% endif %}
    {%- endfor %}
{%- endif %}

with teams_summed as (
    select
        {{ grain | join(', ') }},
        {%- for m in measures %}
        sum({{ m }}) as {{ m }}{{ "," if not loop.last }}
        {%- endfor %}
    from {{ ref('mart_team_splits') }}
    group by {{ grain | join(', ') }}
)

select
    {{ grain | join(', ') }},
    t.games as teams_games,
    l.games as league_games
from teams_summed as t
-- FULL JOIN keeps a group found on only one side.
full join {{ ref('mart_league_splits') }} as l using ({{ grain | join(', ') }})
where t.season is null
   or l.season is null
   -- Rounded, because EPA is a floating-point sum and adding the same
   -- numbers in another order can differ in the last digit.
   {%- for m in measures %}
   or round(t.{{ m }}::numeric, 6) is distinct from round(l.{{ m }}::numeric, 6)
   {%- endfor %}
