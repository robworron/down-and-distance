-- Regular-season games per season (step 1.2 Done-when check).
-- Expected: 248 for 1999–2001 (31 teams), 256 for 2002–2020, 272 from 2021,
-- except 271 in 2022 (the cancelled Bills–Bengals game).
--
-- Postgres runs the clauses in this order, not the order they're written:
--   FROM -> WHERE -> GROUP BY -> SELECT -> ORDER BY

SELECT
    season,
    COUNT(*) AS games            -- rows in each season's group = games that season
FROM raw.schedules               -- schema "raw", table "schedules"
WHERE game_type = 'REG'          -- drop playoff rows (WC, DIV, CON, SB) before grouping
GROUP BY season                  -- one group, and so one output row, per season
ORDER BY season;                 -- sort last, so the 28 rows read top to bottom
