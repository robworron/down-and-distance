-- time_slot uses the day of week computed from gameday; nflverse also
-- publishes a weekday name. They must agree, or one of them is wrong.

select game_id, gameday, weekday
from {{ ref('games') }}
where weekday <> trim(to_char(gameday, 'Day'))
