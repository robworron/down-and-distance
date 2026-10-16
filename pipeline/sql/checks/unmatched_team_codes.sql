-- Team codes in raw.schedules that resolve to nothing (step 1.4 Done-when check).
-- Expected: zero rows.
--
-- A code resolves if it is a team_abbr in raw.teams, or an old code in the
-- relocation map (transform/seeds/team_code_map.csv). The map isn't in the
-- database until dbt seeds it in Phase 2, so its codes are typed inline here.

WITH schedule_codes AS (
    -- Every game has two teams, in two columns. UNION stacks them into one
    -- column and removes duplicates, giving each code used once.
    SELECT home_team AS team_code FROM raw.schedules
    UNION
    SELECT away_team FROM raw.schedules
),
relocation_map (old_code, current_code) AS (
    -- VALUES builds a small table on the fly: one row per pair.
    VALUES ('OAK', 'LV'), ('SD', 'LAC'), ('STL', 'LA'), ('LAR', 'LA')
)
SELECT c.team_code
FROM schedule_codes AS c
-- LEFT JOIN keeps every schedule code, even when there's no match; the
-- unmatched side's columns come back NULL.
LEFT JOIN raw.teams AS t ON t.team_abbr = c.team_code
LEFT JOIN relocation_map AS m ON m.old_code = c.team_code
-- NULL on both sides means neither table knows the code: an orphan.
WHERE t.team_abbr IS NULL
  AND m.old_code IS NULL
ORDER BY c.team_code;
