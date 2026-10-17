-- No NFL game in the US kicks off before 9:30 am Eastern; only international
-- games (neutral sites) do. An earlier kickoff elsewhere is a clock slip like
-- the 2000-05 Monday night games nflverse lists at 09:00 instead of 21:00:
-- add it to seeds/schedule_corrections.csv. Returns the offending games.

select game_id, kickoff_et, location, stadium_id
from {{ ref('stg_schedules') }}
where kickoff_et::time < time '09:30'
  and location <> 'Neutral'
