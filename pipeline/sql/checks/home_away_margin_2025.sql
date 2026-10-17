-- Each team's 2025 home and away average margin (step 2.1 Done-when check).
-- Expected: 64 rows, 32 teams x (home, away).
--
-- The problem: raw.schedules has ONE row per game, with the two teams in two
-- different columns (home_team, away_team). To ask "how did each team do?"
-- we need ONE row per team per game ("long format"), so a single GROUP BY
-- team can see all of a team's games no matter which column it sat in.
--
-- Neutral-site games (international games, the Super Bowl) are left out:
-- the "home" team there is only a designation, so they'd blur a home/away split.

WITH team_games AS (
    -- Branch 1: every game seen from the home team's side.
    SELECT
        home_team               AS team,
        'home'                  AS venue,
        home_score - away_score AS margin      -- positive = this team won by that much
    FROM raw.schedules
    WHERE season = 2025
      AND game_type = 'REG'                    -- regular season only
      AND location = 'Home'                    -- drops neutral-site games
      AND home_score IS NOT NULL               -- played games only

    -- UNION ALL stacks the second SELECT's rows under the first. ALL keeps
    -- every row; plain UNION would also remove duplicates, which is wasted
    -- work here and could wrongly merge two identical rows (same team, same margin).
    UNION ALL

    -- Branch 2: the same games seen from the away team's side. The margin
    -- flips sign: a 7-point home win is a 7-point away loss.
    SELECT
        away_team,
        'away',
        away_score - home_score
    FROM raw.schedules
    WHERE season = 2025
      AND game_type = 'REG'
      AND location = 'Home'
      AND home_score IS NOT NULL
)
SELECT
    team,
    venue,
    COUNT(*)              AS games,       -- n behind the average
    ROUND(AVG(margin), 1) AS avg_margin
FROM team_games                            -- the long-format CTE above
GROUP BY team, venue                       -- one output row per team per venue
ORDER BY team, venue;
