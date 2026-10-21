{#
  A team code as today's franchise code: OAK -> LV, SD -> LAC, STL -> LA
  (from the team_code_map seed). Codes not in the map pass through unchanged,
  and NULL stays NULL.
#}
{% macro current_team(column) -%}
    coalesce(
        (select m.current_code from {{ ref('team_code_map') }} as m where m.old_code = {{ column }}),
        {{ column }}
    )
{%- endmacro %}
