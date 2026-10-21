-- From the 2002 realignment, divisions are today's divisions, so nflverse's
-- div_game must agree with stg_teams. (Before 2002 the divisions differed;
-- div_game is trusted as published.) Returns any disagreement.

select g.game_id, g.div_game, h.division as home_division, a.division as away_division
from {{ ref('games') }} as g
join {{ ref('stg_teams') }} as h on h.team_abbr = g.home_team
join {{ ref('stg_teams') }} as a on a.team_abbr = g.away_team
where g.season >= 2002
  and g.div_game <> (h.division = a.division)
