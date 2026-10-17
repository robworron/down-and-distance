-- Weather rule 2: closed-roof games get no weather, even though
-- raw.game_weather has rows for retractable-roof stadiums.
-- Returns games that aren't open air but carry any weather value or bucket.

select game_id, roof_type, temperature_bucket, wind_bucket, precipitation_bucket
from {{ ref('games') }}
where not is_open_air
  and (temperature_f is not null or wind_mph is not null
       or precipitation_in is not null or snowfall_in is not null
       or temperature_bucket is not null or wind_bucket is not null
       or precipitation_bucket is not null)
