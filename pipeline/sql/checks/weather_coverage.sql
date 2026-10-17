-- Weather coverage (step 1.6 Done-when check; rule widened 2026-10-17).
-- Expected: over 99% of finished games played in the open have a weather row.
--
-- "Played in the open" means either:
--   - the game's own roof in schedules is 'outdoors' or 'open', or
--   - the stadium has no roof at all (roof = 'outdoors' in stadiums.csv).
-- The second part catches nflverse's mislabels, such as the 2026 Melbourne
-- Cricket Ground game, listed as 'dome' although the MCG has no roof.
--
-- Other conditions: from 2000 (1999 has no kickoff times), finished, and more
-- than 9 days ago (Open-Meteo's archive lags, so the loader waits a week).

WITH open_air_stadiums (stadium_id) AS (
    -- stadiums.csv isn't in the database until dbt seeds it (Phase 2), so its
    -- 49 roofless stadiums are typed in here. A pytest check
    -- (test_open_air_list_matches_seed) fails if this list drifts from the CSV.
    VALUES
        ('BAL00'), ('BER00'), ('BOS00'), ('BOS99'), ('BRG00'), ('BUF00'), ('CAR00'), ('CHI98'), ('CHI99'),
        ('CIN00'), ('CIN99'), ('CLE00'), ('DAL99'), ('DEN00'), ('DEN99'), ('DUB00'), ('GER00'), ('GNB00'),
        ('JAX00'), ('KAN00'), ('LAX97'), ('LAX99'), ('LON00'), ('LON01'), ('LON02'), ('MEL00'),
        ('MEX00'), ('MIA00'), ('MIN98'), ('MUN01'), ('NAS00'), ('NYC00'), ('NYC01'), ('OAK00'),
        ('PAR00'), ('PHI00'), ('PHI99'), ('PHO99'), ('PIT00'), ('PIT99'), ('RIO00'), ('SAO00'),
        ('SDG00'), ('SEA00'), ('SEA99'), ('SFO00'), ('SFO01'), ('TAM00'), ('WAS00')
)
SELECT
    count(*)                                         AS games,
    count(w.game_id)                                 AS with_weather,   -- count(col) skips NULLs
    round(100.0 * count(w.game_id) / count(*), 2)    AS coverage_pct
FROM raw.schedules AS s
-- LEFT JOIN keeps games with no weather row; their w.* columns come back NULL.
LEFT JOIN raw.game_weather AS w ON w.game_id = s.game_id
WHERE s.season >= 2000
  -- The brackets matter: AND binds tighter than OR, so without them the OR
  -- would escape every other condition in this WHERE.
  AND (s.roof IN ('outdoors', 'open')
       OR s.stadium_id IN (SELECT stadium_id FROM open_air_stadiums))
  AND s.gametime IS NOT NULL
  AND s.home_score IS NOT NULL
  AND s.gameday::date <= current_date - 9;           -- gameday is text in raw; ::date casts it
