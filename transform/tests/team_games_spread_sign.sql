-- Sign check against a game we know: Super Bowl LVII (2022 season, 12 Feb
-- 2023). The Eagles were favoured; the Chiefs won 38-35 and covered.
-- nflverse's line has PHI (listed home) favoured by 1, so PHI's team_spread
-- must be -1 and KC's +1. The total was 51 and 73 points were scored, so
-- both rows read over (step 0.31). Returns a row for anything that disagrees.

with expected (team, team_spread, spread_role, result, margin, ats_result, total_result, season_type) as (
    values
        ('PHI', -1.0, 'pickem', 'loss', -3, 'no_cover', 'over', 'POST'),
        ('KC',   1.0, 'pickem', 'win',   3, 'cover',    'over', 'POST')
)
select e.team, t.team_spread, t.spread_role, t.result, t.margin,
       t.ats_result, t.total_result, t.season_type
from expected as e
left join {{ ref('team_games') }} as t
  on t.game_id = '2022_22_KC_PHI' and t.team = e.team
where t.team is null
   or t.team_spread <> e.team_spread
   or t.spread_role <> e.spread_role
   or t.result <> e.result
   or t.margin <> e.margin
   -- KC covered: margin + team_spread > 0 means beat the spread
   or (e.team = 'KC' and t.margin + t.team_spread <= 0)
   or t.ats_result is distinct from e.ats_result
   or t.total_result is distinct from e.total_result
   or t.season_type is distinct from e.season_type
