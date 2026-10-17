-- The streak entering a game agrees with the previous result: positive
-- after a win, negative after a loss, 0 after a tie, and NULL exactly when
-- there's no previous result (first game, or the previous one not played).
-- Returns any row that breaks this.

select game_id, team, prev_result, streak
from {{ ref('team_games') }}
where (prev_result = 'win'  and streak <= 0)
   or (prev_result = 'loss' and streak >= 0)
   or (prev_result = 'tie'  and streak <> 0)
   or ((prev_result is null) <> (streak is null))
