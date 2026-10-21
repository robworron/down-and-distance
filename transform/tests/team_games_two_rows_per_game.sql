-- Step 0.26 Done-when: every game appears exactly twice in team_games, once
-- per team, and every game in games appears at all.
-- Returns any game with a count other than 2.

select g.game_id, count(t.game_id) as team_rows
from {{ ref('games') }} as g
-- LEFT JOIN so a game missing from team_games shows up with 0 rows.
left join {{ ref('team_games') }} as t on t.game_id = g.game_id
group by g.game_id
having count(t.game_id) <> 2
