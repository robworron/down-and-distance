-- One row per finished game from 2000 outside a fixed dome: Open-Meteo weather.
-- Kickoff-hour values (for comparing with nflverse) and game-window values
-- (kickoff to kickoff + 3 h, which the warehouse's weather buckets use). Whether weather
-- applies to a game at all (closed roofs) is decided in the games model.

select
    game_id,
    season::integer          as season,
    kickoff_utc,
    latitude,
    longitude,

    -- Kickoff hour
    temperature_f,
    precipitation_in,
    snowfall_in,
    wind_mph,
    wind_gust_mph,

    -- Game window
    temperature_avg_f,       -- mean of hours k..k+3
    wind_max_mph,            -- max of hours k..k+3
    wind_gust_max_mph,
    precipitation_total_in,  -- sum of hours k+1..k+3 (each hour's value covers the hour before it)
    snowfall_total_in
from {{ source('raw', 'game_weather') }}
