-- One row per team per game since 2016, from play-by-play: what the team's
-- offense did and, from the opponent's row, what its defense allowed.
-- Sums and counts only, never averages: EPA/play is sum(epa) divided by
-- sum(dropbacks + rushes) over whatever games you pick, so any season range
-- adds up correctly. Where an official box score stat exists, the rules
-- follow it; Super Bowl LVII matches ESPN's team stats on every figure
-- (tests/team_game_stats_box_score.sql).

with

plays as (
    select
        *,
        -- Two-point tries aren't scrimmage plays in the box score.
        coalesce(two_point_attempt, 0) = 1                  as is_two_point,
        -- Box-score snaps: passes and runs (scrambles are runs), plus kneels
        -- and spikes, which officially count as runs and passes. Plays wiped
        -- out by a penalty are play_type 'no_play' and don't count.
        play_type in ('pass', 'run', 'qb_kneel', 'qb_spike') as is_box_snap,
        -- "Real" plays for EPA/play and success rate: nflverse's pass and rush
        -- flags, which leave out kneels and spikes (not real attempts) but
        -- keep snaps with a penalty, whose EPA includes the penalty's effect.
        (pass = 1 or rush = 1) and epa is not null          as is_real_play
    from {{ ref('stg_pbp') }}
),

-- Step 1: each team's offense. posteam has the ball, defteam is the other
-- team; FILTER (WHERE ...) restricts one aggregate to the plays that count.
offense as (
    select
        game_id,
        season,
        posteam                                                                as team,
        defteam                                                                as opponent,
        count(*) filter (where is_box_snap and not is_two_point)               as plays,
        coalesce(sum(yards_gained) filter (where is_box_snap and not is_two_point), 0) as yards,
        count(*) filter (where is_real_play and not is_two_point and pass = 1) as dropbacks,
        count(*) filter (where is_real_play and not is_two_point and rush = 1) as rushes,
        coalesce(sum(epa) filter (where is_real_play and not is_two_point), 0) as epa,
        coalesce(sum(success) filter (where is_real_play and not is_two_point), 0) as successes,
        coalesce(sum(sack), 0)                                                 as sacks_taken,
        coalesce(sum(interception), 0)                                         as interceptions,
        coalesce(sum(third_down_converted), 0) + coalesce(sum(third_down_failed), 0) as third_down_attempts,
        coalesce(sum(third_down_converted), 0)                                 as third_down_conversions
    from plays
    where posteam is not null              -- timeouts and quarter ends have no offense
    group by game_id, season, posteam, defteam
),

-- Step 2: lost fumbles, charged to the team that lost the ball. On a punt
-- posteam is the punting team, so a muffed or fumbled return is the
-- receiving team's (defteam); a fumble after an interception is the
-- intercepting team's (defteam). Otherwise it's posteam: the offense on a
-- scrimmage play, and the receiving team on a kickoff, where nflverse gives
-- the receiving team the ball. This matches the play text's "RECOVERED by"
-- on 99.7% of lost fumbles since 2016.
fumbles as (
    select
        game_id,
        case
            when play_type = 'punt' or interception = 1 then defteam
            else posteam
        end                                as team,
        count(*)                           as fumbles_lost
    from plays
    where fumble_lost = 1
    group by 1, 2
),

-- Step 3: red-zone trips, one row per drive that ran a snap from the
-- opponent's 20 or closer (fixed_drive numbers the drives within a game).
-- A field-goal try counts as a snap; extra points and two-point tries,
-- snapped from the 15 and the 2, don't.
red_zone_drives as (
    select
        game_id,
        posteam                            as team,
        fixed_drive,
        bool_or(fixed_drive_result = 'Touchdown') as scored_td
    from plays
    where yardline_100 <= 20
      and not is_two_point
      and (pass = 1 or rush = 1 or play_type in ('qb_kneel', 'qb_spike', 'field_goal'))
    group by game_id, posteam, fixed_drive
),

red_zone as (
    select
        game_id,
        team,
        count(*)                           as red_zone_trips,
        count(*) filter (where scored_td)  as red_zone_tds
    from red_zone_drives
    group by game_id, team
),

-- Step 4: penalties, charged to the penalised team (any play, kicks included;
-- nflverse sets penalty = 1 for accepted penalties).
penalties as (
    select
        game_id,
        penalty_team                       as team,
        count(*)                           as penalties,
        sum(penalty_yards)                 as penalty_yards
    from plays
    where penalty = 1
    group by game_id, penalty_team
),

-- Step 5: one row per team per game with everything about its own play.
-- LEFT JOINs: a team with no lost fumbles, red-zone trips or penalties has
-- no row in those CTEs, and that means 0, not "unknown".
team_rows as (
    select
        o.*,
        coalesce(f.fumbles_lost, 0)                     as fumbles_lost,
        o.interceptions + coalesce(f.fumbles_lost, 0)   as turnovers,
        coalesce(rz.red_zone_trips, 0)                  as red_zone_trips,
        coalesce(rz.red_zone_tds, 0)                    as red_zone_tds,
        coalesce(p.penalties, 0)                        as penalties,
        coalesce(p.penalty_yards, 0)                    as penalty_yards
    from offense as o
    left join fumbles   as f  on f.game_id  = o.game_id and f.team  = o.team
    left join red_zone  as rz on rz.game_id = o.game_id and rz.team = o.team
    left join penalties as p  on p.game_id  = o.game_id and p.team  = o.team
)

-- Step 6: a team's defense is its opponent's offense. Join each row to the
-- other team's row in the same game and read its offense as this team's
-- defense: yards allowed, EPA allowed, sacks made, takeaways.
select
    t.game_id,
    t.season,
    t.team,
    t.opponent,

    -- Offense (box score)
    t.plays,
    t.yards,
    -- Offense (real plays: EPA/play and success rate use dropbacks + rushes)
    t.dropbacks,
    t.rushes,
    t.epa,
    t.successes,
    -- Situational offense
    t.third_down_attempts,
    t.third_down_conversions,
    t.red_zone_trips,
    t.red_zone_tds,
    -- Ball security and discipline
    t.sacks_taken,
    t.interceptions,
    t.fumbles_lost,
    t.turnovers,
    t.penalties,
    t.penalty_yards,

    -- Defense = the opponent's offense
    d.plays          as def_plays,
    d.yards          as def_yards,
    d.dropbacks      as def_dropbacks,
    d.rushes         as def_rushes,
    d.epa            as def_epa,
    d.successes      as def_successes,
    d.sacks_taken    as sacks,
    d.turnovers      as takeaways
from team_rows as t
join team_rows as d
  on d.game_id = t.game_id
 and d.team = t.opponent
