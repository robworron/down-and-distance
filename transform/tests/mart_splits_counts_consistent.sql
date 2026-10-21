-- The counts inside each split row agree with each other, in both marts:
--   - every game is a win, a loss or a tie;
--   - ATS and over/under results never exceed the games with a line, and
--     the three over/under results add up to the games with a total;
--   - play-by-play sums are NULL exactly when no game has play-by-play;
--   - the sums of squares are consistent with the sums: a variance can't be
--     negative, so n * sum(x^2) >= (sum x)^2 (step 0.44).
-- Returns each row that breaks a rule, naming the mart.

with splits as (
    select 'team' as mart, team, season, season_type, situation_key, situation_value,
           games, wins, losses, ties, points_for, points_against, margin_sq, total_points_sq,
           ats_games, ats_covers, ats_pushes,
           ou_games, overs, unders, ou_pushes, stats_games, plays, epa
    from {{ ref('mart_team_splits') }}

    union all

    select 'league', null, season, season_type, situation_key, situation_value,
           games, wins, losses, ties, points_for, points_against, margin_sq, total_points_sq,
           ats_games, ats_covers, ats_pushes,
           ou_games, overs, unders, ou_pushes, stats_games, plays, epa
    from {{ ref('mart_league_splits') }}
)

select *
from splits
where games < 1
   or wins + losses + ties <> games
   or ats_games > games
   or ats_covers + ats_pushes > ats_games
   or ou_games > games
   or overs + unders + ou_pushes <> ou_games
   or stats_games > games
   -- (stats_games = 0) must be true exactly when plays is NULL; epa too.
   or (stats_games = 0) <> (plays is null)
   or (stats_games = 0) <> (epa is null)
   -- n * sum(x^2) - (sum x)^2 is n^2 times the variance, so never negative.
   -- bigint, because games * total_points_sq can pass integer's 2.1 billion.
   or games::bigint * margin_sq
      < (points_for - points_against)::bigint * (points_for - points_against)
   or games::bigint * total_points_sq
      < (points_for + points_against)::bigint * (points_for + points_against)
