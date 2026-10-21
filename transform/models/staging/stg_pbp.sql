-- One row per play since 2016: raw.pbp cleaned.
-- 0/1 flags stay as small integers on purpose: sum(success) counts successful
-- plays and avg(success) gives a rate, which booleans would make clumsier.

select
    -- Keys and context
    game_id,
    play_id,
    season::integer                       as season,
    week::integer                         as week,
    season_type,                          -- REG / POST
    {{ current_team('posteam') }}         as posteam,       -- team with the ball
    {{ current_team('defteam') }}         as defteam,
    posteam_type,                         -- home / away

    -- Game state
    qtr,
    down,
    ydstogo,
    yardline_100,                         -- yards from the opponent's end zone
    goal_to_go,
    game_seconds_remaining,
    score_differential,                   -- posteam's score minus defteam's

    -- Drives
    fixed_drive,
    fixed_drive_result,

    -- Play type and filters
    play_type,
    pass,
    rush,
    qb_dropback,
    qb_scramble,
    qb_kneel,
    qb_spike,
    aborted_play,
    two_point_attempt,

    -- Play value
    epa,
    success,
    yards_gained,
    first_down,

    -- Win probability
    wp,
    wpa,

    -- Passing and rushing
    pass_attempt,
    complete_pass,
    air_yards,
    cpoe,
    pass_oe,
    rush_attempt,

    -- Turnovers and sacks
    interception,
    fumble,
    fumble_lost,
    sack,

    -- Scoring
    touchdown,
    pass_touchdown,
    rush_touchdown,
    return_touchdown,
    {{ current_team('td_team') }}         as td_team,
    safety,

    -- Third and fourth down
    third_down_converted,
    third_down_failed,
    fourth_down_converted,
    fourth_down_failed,

    -- Penalties
    penalty,
    {{ current_team('penalty_team') }}    as penalty_team,
    penalty_yards,

    -- Kicking
    field_goal_attempt,
    field_goal_result,
    extra_point_result,
    punt_attempt,

    -- "desc" is an SQL keyword (ORDER BY ... DESC), so it needs quoting
    -- everywhere; a plain name is easier to use.
    "desc"                                as play_description
from {{ source('raw', 'pbp') }}
