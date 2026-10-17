-- Weather coverage (step 1.6 Done-when check).
-- Expected: over 99% of finished outdoor and open-roof games have a weather row.
--
-- Which games should have weather: from 2000 (1999 has no kickoff times),
-- played outdoors or with the roof open, finished, and more than 9 days ago
-- (Open-Meteo's archive lags, so the loader waits a week before asking).

SELECT
    count(*)                                         AS games,
    count(w.game_id)                                 AS with_weather,   -- count(col) skips NULLs
    round(100.0 * count(w.game_id) / count(*), 2)    AS coverage_pct
FROM raw.schedules AS s
-- LEFT JOIN keeps games with no weather row; their w.* columns come back NULL.
LEFT JOIN raw.game_weather AS w ON w.game_id = s.game_id
WHERE s.season >= 2000
  AND s.roof IN ('outdoors', 'open')
  AND s.gametime IS NOT NULL
  AND s.home_score IS NOT NULL
  AND s.gameday::date <= current_date - 9;           -- gameday is text in raw; ::date casts it
