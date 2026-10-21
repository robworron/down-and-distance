-- The other half of the rule: an open-air game that has a weather row must get
-- all three weather buckets. Returns any open-air game with a gap.

select g.game_id
from {{ ref('games') }} as g
join {{ ref('stg_game_weather') }} as w on w.game_id = g.game_id
where g.is_open_air
  and (g.temperature_bucket is null or g.wind_bucket is null or g.precipitation_bucket is null)
