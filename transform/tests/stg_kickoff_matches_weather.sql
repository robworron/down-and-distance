-- stg_schedules (SQL) and the weather loader (Python) compute kickoff_utc
-- separately, both after applying schedule_corrections. They must agree, or
-- the weather describes the wrong hours. Returns the games where they differ.

select
    s.game_id,
    s.kickoff_utc as staging_kickoff_utc,
    w.kickoff_utc as weather_kickoff_utc
from {{ ref('stg_schedules') }} as s
join {{ ref('stg_game_weather') }} as w on w.game_id = s.game_id
where s.kickoff_utc <> w.kickoff_utc
