-- This week's situations, checked independently (step 0.48 Done-when check).
-- team_games takes each team's rest days from nflverse (home_rest/away_rest).
-- Here they are recomputed from the schedule itself: the days between this
-- game and the team's previous game that season. Every row of this week
-- should agree, so the expected result is 0 rows.
--
-- Postgres runs the clauses in this order: FROM -> WHERE -> window
-- functions (LAG) -> SELECT. The outer query filters after LAG has run, so
-- each game still sees the team's earlier games.

WITH this_week AS (                      -- the page's week: the latest season's
    SELECT season, MIN(week) AS week     -- lowest week with a game still to play
    FROM marts.games
    WHERE NOT is_finished
      AND season = (SELECT MAX(season) FROM marts.games)
    GROUP BY season
),

with_previous AS (
    SELECT
        tg.season,
        tg.week,
        tg.game_id,
        tg.team,
        tg.rest_days,
        -- LAG looks one row back within the team's season, in date order:
        -- the date of the team's previous game.
        tg.gameday - LAG(tg.gameday) OVER (
            PARTITION BY tg.team, tg.season ORDER BY tg.gameday
        ) AS days_since_previous
    FROM marts.team_games AS tg
    WHERE tg.season = (SELECT season FROM this_week)
)

SELECT p.game_id, p.team, p.rest_days, p.days_since_previous
FROM with_previous AS p
JOIN this_week AS w ON w.season = p.season AND w.week = p.week
-- A team's first game has no previous game; nflverse counts it as 7 days.
WHERE p.rest_days IS DISTINCT FROM COALESCE(p.days_since_previous, 7)
ORDER BY p.game_id, p.team;
