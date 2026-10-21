-- Step 0.27 Done-when: travel and body clock against games checked by hand.
--   Seattle at Pittsburgh, 1:00 pm ET on 14 Sep 2025: kickoff was 10:00 am
--   on Seattle's clock, 3 time zones east, 2,132 miles.
--   Arizona and the Rams: Arizona stays on Mountain Standard Time (UTC-7)
--   all year. In October Los Angeles is on daylight time (also UTC-7), so
--   the clocks match: 0 zones. In December LA is on standard time (UTC-8),
--   so Arizona is an hour ahead: the Rams go 1 zone east to play there, and
--   Arizona 1 zone west.
--   Melbourne (2026, LA as the designated home team): its clock is 17 hours
--   ahead of LA's, which wraps to 7 zones west.
-- Plus a general rule: a team playing at its own home stadium hasn't moved.
-- Returns a row for anything that disagrees.

with expected (game_id, team, time_zone_shift, time_zone_travel, body_clock_time, body_clock, travel_miles) as (
    values
        ('2025_02_SEA_PIT', 'SEA',  3, 'eastbound_1_3',    time '10:00', 'morning',        2132),
        ('2025_02_SEA_PIT', 'PIT',  0, 'none',             time '13:00', 'afternoon',         0),
        ('2023_06_ARI_LA',  'ARI',  0, 'none',             time '13:25', 'afternoon',       350),  -- October
        ('2025_14_LA_ARI',  'LA',   1, 'eastbound_1_3',    time '13:25', 'afternoon',       350),  -- December
        ('2024_17_ARI_LA',  'ARI', -1, 'westbound_1_3',    time '18:15', 'late_afternoon',  350),  -- December
        ('2026_01_SF_LA',   'LA',  -7, 'long_haul_4_plus', time '17:35', 'late_afternoon', 7929)
)

select e.game_id, e.team, 'spot check' as problem
from expected as e
-- LEFT JOIN so a missing row shows up instead of silently passing.
left join {{ ref('team_games') }} as t
  on t.game_id = e.game_id and t.team = e.team
where t.game_id is null
   or t.time_zone_shift <> e.time_zone_shift
   or t.time_zone_travel <> e.time_zone_travel
   or t.body_clock_time <> e.body_clock_time
   or t.body_clock <> e.body_clock
   or t.travel_miles <> e.travel_miles

union all

select game_id, team, 'at its home stadium but travelled'
from {{ ref('team_games') }}
where stadium_id = home_stadium_id
  and (travel_miles <> 0 or time_zone_shift <> 0)
