-- Step 0.28 Done-when: two games' stats match their official box scores
-- (ESPN team stats): Super Bowl LVII (KC 38, PHI 35) and Seattle's 31-17 win
-- at Pittsburgh on 14 Sep 2025.
-- One known gap: ESPN has Pittsburgh at 59 plays. nflverse files Rodgers'
-- intentional grounding as 'no_play', which the box score counts as a pass
-- attempt; 24 plays since 2016 are filed that way. Yards are unaffected.
-- Returns a row for any team whose figures disagree.

with expected (game_id, team, plays, yards, third_down_conversions, third_down_attempts,
               red_zone_tds, red_zone_trips, penalties, penalty_yards,
               sacks_taken, interceptions, fumbles_lost, turnovers) as (
    values
        ('2022_22_KC_PHI',  'KC',  53, 340,  4,  8, 4, 5, 3, 14, 0, 0, 0, 0),
        ('2022_22_KC_PHI',  'PHI', 72, 417, 11, 18, 3, 5, 6, 33, 2, 0, 1, 1),
        ('2025_02_SEA_PIT', 'SEA', 64, 395,  6, 14, 2, 3, 2, 10, 2, 2, 0, 2),
        ('2025_02_SEA_PIT', 'PIT', 58, 267,  5, 15, 1, 2, 2, 15, 3, 2, 0, 2)  -- ESPN: 59 plays (grounding)
)

select e.game_id, e.team
from expected as e
left join {{ ref('team_game_stats') }} as s
  on s.game_id = e.game_id and s.team = e.team
where s.game_id is null
   or s.plays                  <> e.plays
   or s.yards                  <> e.yards
   or s.third_down_conversions <> e.third_down_conversions
   or s.third_down_attempts    <> e.third_down_attempts
   or s.red_zone_tds           <> e.red_zone_tds
   or s.red_zone_trips         <> e.red_zone_trips
   or s.penalties              <> e.penalties
   or s.penalty_yards          <> e.penalty_yards
   or s.sacks_taken            <> e.sacks_taken
   or s.interceptions          <> e.interceptions
   or s.fumbles_lost           <> e.fumbles_lost
   or s.turnovers              <> e.turnovers
