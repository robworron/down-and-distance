-- Do Open-Meteo's kickoff temperatures agree with nflverse's? (step 0.16 Done-when check)
-- nflverse's `temp` (from Pro Football Reference) is the reported game-time
-- temperature for outdoor games, so the two should broadly agree.
-- Expected: correlation above 0.9, and a median gap of a few degrees F.

SELECT
    count(*)                                                AS games_compared,
    round(corr(w.temperature_f, s.temp)::numeric, 3)        AS correlation,      -- 1 = perfectly in step
    round(avg(w.temperature_f - s.temp)::numeric, 1)        AS mean_gap_f,       -- + means Open-Meteo runs warmer
    percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(w.temperature_f - s.temp)) AS median_abs_gap_f,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY abs(w.temperature_f - s.temp)) AS p90_abs_gap_f
FROM raw.game_weather AS w
JOIN raw.schedules AS s USING (game_id)                     -- USING: join on the same-named column
WHERE s.temp IS NOT NULL;                                   -- only games where nflverse has a temperature
