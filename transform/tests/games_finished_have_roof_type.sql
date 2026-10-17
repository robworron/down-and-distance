-- Every played game should have a roof type. The one known exception is the
-- 2025 Madrid game: the Bernabéu's retractable roof position that day wasn't
-- reported (see seeds/schedule_corrections.csv). Returns any other gap.

select game_id, stadium_id
from {{ ref('games') }}
where is_finished
  and roof_type is null
  and game_id <> '2025_11_WAS_MIA'
