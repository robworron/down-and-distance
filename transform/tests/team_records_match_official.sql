-- Season records checked against official sources in step 0.43, pinned so a
-- rebuild can't silently change them. Each team's record is its venue rows
-- summed (every game has a venue), as the site's team page computes it.
-- Returns a row for every figure that differs, so an empty result passes.
--
-- Sources (checked 2026-10-19):
--   NFL.com 2022 standings: Bills 13-3, 455-286; Commanders 8-8-1, 321-343;
--     Bengals 12-4 (both 16 games: the Week 17 Bills-Bengals game was
--     cancelled and never replayed).
--   Wikipedia, List of Washington Commanders seasons (citing the NFL), every
--     season 1999-2025 matched; pinned here: the two ties (2016 8-7-1,
--     2022 8-8-1) and the 2024 playoff run (2-1, lost the NFC Championship).

with

expected (team, season, season_type, wins, losses, ties, points_for, points_against) as (
    -- NULL points mean "not checked"; only the records are compared then.
    values
        ('BUF', 2022, 'REG', 13, 3, 0, 455, 286),
        ('WAS', 2022, 'REG', 8, 8, 1, 321, 343),
        ('CIN', 2022, 'REG', 12, 4, 0, null, null),
        ('WAS', 2016, 'REG', 8, 7, 1, null, null),
        ('WAS', 2024, 'REG', 12, 5, 0, null, null),
        ('WAS', 2024, 'POST', 2, 1, 0, null, null)
),

actual as (
    select team, season, season_type,
           sum(wins) as wins, sum(losses) as losses, sum(ties) as ties,
           sum(points_for) as points_for, sum(points_against) as points_against
    from {{ ref('mart_team_splits') }}
    where situation_key = 'venue'
    group by team, season, season_type
)

select e.*, a.wins as actual_wins, a.losses as actual_losses, a.ties as actual_ties,
       a.points_for as actual_points_for, a.points_against as actual_points_against
from expected as e
left join actual as a using (team, season, season_type)
-- IS DISTINCT FROM is "not equal" that also treats a missing row (NULL) as a
-- difference, where plain <> would quietly let it pass.
where a.wins is distinct from e.wins
   or a.losses is distinct from e.losses
   or a.ties is distinct from e.ties
   or (e.points_for is not null and a.points_for is distinct from e.points_for)
   or (e.points_against is not null and a.points_against is distinct from e.points_against)
