-- Step 0.29 Done-when: one team's full season reads correctly, row by row.
-- The 2024 Eagles: opened in Sao Paulo (a road game for both teams), lost
-- 33-16 at Tampa Bay just before their week-5 bye, then won 10 straight
-- until Washington beat them 36-33, and won the Super Bowl after a two-week
-- break. Every value describes the team entering that game.
-- Returns a row for any game that disagrees, or is missing.

with expected (game_number, opponent, prev_result, streak, after_blowout_loss, games_since_bye, consecutive_road_games) as (
    values
        ( 1, 'GB',  null,   null, null,  0, 1),  -- Sao Paulo
        ( 2, 'ATL', 'win',     1, false, 1, 0),
        ( 3, 'NO',  'loss',   -1, false, 2, 1),
        ( 4, 'TB',  'win',     1, false, 3, 2),  -- lost 33-16
        ( 5, 'CLE', 'loss',   -1, true,  0, 0),  -- after the bye and the TB blowout
        ( 6, 'NYG', 'win',     1, false, 1, 1),
        ( 7, 'CIN', 'win',     2, false, 2, 2),
        ( 8, 'JAX', 'win',     3, false, 3, 0),
        ( 9, 'DAL', 'win',     4, false, 4, 1),
        (10, 'WAS', 'win',     5, false, 5, 0),
        (11, 'LA',  'win',     6, false, 6, 1),
        (12, 'BAL', 'win',     7, false, 7, 2),
        (13, 'CAR', 'win',     8, false, 8, 0),
        (14, 'PIT', 'win',     9, false, 9, 0),
        (15, 'WAS', 'win',    10, false, 10, 1),  -- streak ends 36-33
        (16, 'DAL', 'loss',   -1, false, 11, 0),
        (17, 'NYG', 'win',     1, false, 12, 0),
        (18, 'GB',  'win',     2, false, 13, 0),  -- wild card
        (19, 'LA',  'win',     3, false, 14, 0),
        (20, 'WAS', 'win',     4, false, 15, 0),
        (21, 'KC',  'win',     5, false, 0, 1)    -- Super Bowl LIX, 14 days' rest
)

select e.game_number, e.opponent
from expected as e
-- FULL JOIN catches both a wrong value and an extra or missing game.
full join (
    select * from {{ ref('team_games') }} where team = 'PHI' and season = 2024
) as t
  on t.game_number = e.game_number
where e.game_number is null
   or t.game_number is null
   or t.opponent <> e.opponent
   or t.prev_result is distinct from e.prev_result
   or t.streak is distinct from e.streak
   or t.after_blowout_loss is distinct from e.after_blowout_loss
   or t.games_since_bye <> e.games_since_bye
   or t.consecutive_road_games <> e.consecutive_road_games
