-- The whole league's record in every situation, per season and season type:
-- mart_team_splits summed over the teams. Because the team mart holds only
-- sums and counts, the league's numbers are just the teams' added up, with
-- nothing recomputed (mart_splits_additive.sql checks it).
--
-- games counts team-games: a game in 15+ mph wind adds two (one per team).
-- So for a game-level situation the league is 50% wins by construction (one
-- winner per game); compare those on points and over/under rate instead.
-- Win % across the league is meaningful for team-level situations only.

select
    season,
    season_type,
    situation_key,
    situation_level,
    situation_value,

    -- SUM of an integer column returns bigint in Postgres; casting back keeps
    -- the types the same as the team mart's (and the site's driver reads
    -- integers as numbers, but bigints as strings).
    sum(games)::integer                  as games,
    sum(wins)::integer                   as wins,
    sum(losses)::integer                 as losses,
    sum(ties)::integer                   as ties,
    sum(points_for)::integer             as points_for,
    sum(points_against)::integer         as points_against,

    sum(ats_games)::integer              as ats_games,
    sum(ats_covers)::integer             as ats_covers,
    sum(ats_pushes)::integer             as ats_pushes,
    sum(ou_games)::integer               as ou_games,
    sum(overs)::integer                  as overs,
    sum(unders)::integer                 as unders,
    sum(ou_pushes)::integer              as ou_pushes,

    sum(stats_games)::integer            as stats_games,
    sum(plays)::integer                  as plays,
    sum(yards)::integer                  as yards,
    sum(dropbacks)::integer              as dropbacks,
    sum(rushes)::integer                 as rushes,
    sum(epa)                             as epa,
    sum(successes)::integer              as successes,
    sum(def_plays)::integer              as def_plays,
    sum(def_yards)::integer              as def_yards,
    sum(def_dropbacks)::integer          as def_dropbacks,
    sum(def_rushes)::integer             as def_rushes,
    sum(def_epa)                         as def_epa,
    sum(def_successes)::integer          as def_successes,
    sum(turnovers)::integer              as turnovers,
    sum(takeaways)::integer              as takeaways,
    sum(sacks)::integer                  as sacks,
    sum(sacks_taken)::integer            as sacks_taken,
    sum(third_down_attempts)::integer    as third_down_attempts,
    sum(third_down_conversions)::integer as third_down_conversions,
    sum(red_zone_trips)::integer         as red_zone_trips,
    sum(red_zone_tds)::integer           as red_zone_tds,
    sum(penalties)::integer              as penalties,
    sum(penalty_yards)::integer          as penalty_yards
from {{ ref('mart_team_splits') }}
group by season, season_type, situation_key, situation_level, situation_value
