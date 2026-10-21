-- depends_on: {{ ref('situations') }}
-- depends_on: {{ ref('team_games') }}
-- Each situation's value_list is exactly the set of values its column takes
-- in team_games: nothing listed that never occurs (a typo), nothing in the
-- data that the site wouldn't offer as a filter. The second half is
-- generated from the registry: one SELECT per situation, glued with UNION ALL.
-- Returns each value found on only one side.

{%- set situations = situation_registry() %}

with registry as (
    -- string_to_array splits 'home|away|neutral' into an array, and unnest
    -- turns the array into one row per value.
    select key, unnest(string_to_array(value_list, '|')) as value
    from {{ ref('situations') }}
),

in_data as (
    {%- for s in situations %}
    select distinct '{{ s["key"] }}' as key, {{ s["column_name"] }}::text as value
    from {{ ref('team_games') }}
    where {{ s["column_name"] }} is not null
    {% if not loop.last %}union all{% endif %}
    {%- endfor %}
)

select
    coalesce(r.key, d.key)     as key,
    coalesce(r.value, d.value) as value,
    case when d.value is null then 'listed but never in the data'
         else 'in the data but not listed' end as problem
from registry as r
-- FULL JOIN keeps unmatched rows from both sides.
full join in_data as d on d.key = r.key and d.value = r.value
where r.value is null or d.value is null
