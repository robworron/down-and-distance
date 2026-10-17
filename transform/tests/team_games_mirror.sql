-- The two rows of a game are mirror images: each team is the other's
-- opponent, one row's points_for is the other's points_against, exactly one
-- is the designated home team, and spread and rest differences cancel out.
-- Returns any game that breaks the mirror.

select
    a.game_id
from {{ ref('team_games') }} as a
join {{ ref('team_games') }} as b
  on b.game_id = a.game_id
 and b.team = a.opponent                       -- pair each row with its opponent's row
where a.team <> b.opponent
   or a.points_for is distinct from b.points_against   -- IS DISTINCT FROM treats NULL = NULL as equal
   or a.is_home = b.is_home
   or a.team_spread + b.team_spread <> 0
   or a.rest_diff + b.rest_diff <> 0
   or a.margin + b.margin <> 0
