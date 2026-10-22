-- Team-page rows the small-sample rule changes (step 1.4 check).
-- A team page shows one row per team, situation and value. Below 3 games a
-- row's margin and game-total intervals read "too few games for a range".
-- 1-game rows never had an interval (a spread needs 2 games), so the rule
-- changes exactly the 2-game rows. This counts them over the page's default
-- range, the regular seasons 2024–2026, and compares with the 154 of 1,247
-- counted when the rule was agreed (2026-10-19).
--
-- Clause order: FROM/JOIN -> WHERE -> GROUP BY (in the CTE), then the outer
-- SELECT reads the CTE.

WITH page_rows AS (                       -- a CTE: a named sub-result the next SELECT reads
    SELECT
        s.team,
        s.situation_key,
        s.situation_value,
        sum(s.games) AS games             -- one row's n on the page: its games over the 3 seasons
    FROM marts.mart_team_splits AS s
    JOIN marts.situations AS r            -- the registry, to keep only situations the site shows
        ON r.key = s.situation_key
    WHERE r.in_v1                         -- the v1 situations (trimmed ones aren't on the page)
      AND s.season BETWEEN 2024 AND 2026  -- the page's default range
      AND s.season_type = 'REG'           -- regular season, the page's default
    GROUP BY s.team, s.situation_key, s.situation_value   -- one row per team, situation and value
)
SELECT
    count(*) FILTER (WHERE games > 0) AS rows_with_games,  -- FILTER counts only the rows that pass its condition
    count(*) FILTER (WHERE games = 2) AS rows_changed,     -- 2 games: had an interval, now "too few games"
    count(*) FILTER (WHERE games = 1) AS one_game_rows     -- never had one; unchanged
FROM page_rows;
