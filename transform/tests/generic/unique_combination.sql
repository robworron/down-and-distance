{#
  Fails for every combination of `columns` that appears more than once:
  a uniqueness test for a key made of several columns, e.g. (game_id, play_id).
  Usage in a model's YAML:
    data_tests:
      - unique_combination:
          arguments:
            columns: [game_id, play_id]
#}
{% test unique_combination(model, columns) %}
select
    {{ columns | join(', ') }},
    count(*) as n
from {{ model }}
group by {{ columns | join(', ') }}
having count(*) > 1
{% endtest %}
