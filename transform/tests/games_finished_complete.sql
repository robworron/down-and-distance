-- A finished game has everything the splits count: both scores, the
-- overtime flag, and both betting lines (so every finished team-game gets
-- an ats_result and a total_result). An unplayed game has no scores.
-- Returns each game that breaks the rule.

select game_id, is_finished, home_score, away_score, overtime, spread_line, total_line
from {{ ref('games') }}
where (is_finished and (
          away_score is null
          or overtime is null
          or spread_line is null
          or total_line is null))
   or (not is_finished and (away_score is not null or overtime is not null))
