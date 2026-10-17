-- nflverse lists the 2026 Melbourne Cricket Ground game as 'dome'; the MCG has
-- no roof. It must count as open air with weather. Returns a row if not.

select game_id, roof_type, is_open_air, temperature_bucket
from {{ ref('games') }}
where game_id = '2026_01_SF_LA'
  and not (roof_type = 'outdoors' and is_open_air and temperature_bucket is not null)
