-- Restore-point fingerprint (step 1.2 Done-when check).
-- Run it on the Neon `foundation` branch and on the production branch, in the
-- Neon SQL Editor. Every row must be equal on both: the branch is then an exact
-- snapshot of production as it was when the branch was made. Run it again
-- after any restore to show the restored database is the one that was saved.
--
-- Six tables cover both layers: three raw tables the pipeline loads (the
-- biggest, raw.pbp, included) and three marts the site reads. last_loaded is
-- the newest load time in raw.schedules: a branch made at a different moment,
-- or a restore from an older point, shows up there even if no counts changed.
--
-- Each SELECT below makes one row; UNION ALL stacks them into one result.
-- Postgres runs each SELECT's clauses as FROM -> SELECT, then sorts the
-- stacked rows once with the final ORDER BY.

SELECT
    'raw.schedules' AS table_name,      -- a text label, so each row says what it counts
    count(*) AS row_count,              -- every row in the table, nulls included
    max(_loaded_at) AS last_loaded      -- the most recent upsert time in the table
FROM raw.schedules                      -- every game since 1999, the pipeline's required source

UNION ALL                               -- append the next row; ALL keeps duplicates and skips a costly de-duplicate

SELECT
    'raw.game_weather',                 -- column names come from the first SELECT, so later ones need none
    count(*),
    NULL::timestamptz                   -- no load time here; the cast gives NULL the first SELECT's column type
FROM raw.game_weather                   -- one row per game played in the open air

UNION ALL

SELECT 'raw.pbp', count(*), NULL::timestamptz
FROM raw.pbp                            -- play-by-play since 2016, about 183 MB of the 214 MB

UNION ALL

SELECT 'marts.games', count(*), NULL::timestamptz
FROM marts.games                        -- one row per game, read by the team and This week pages

UNION ALL

SELECT 'marts.team_games', count(*), NULL::timestamptz
FROM marts.team_games                   -- one row per team per game, the base of every split

UNION ALL

SELECT 'marts.mart_league_splits', count(*), NULL::timestamptz
FROM marts.mart_league_splits           -- the league-wide splits the explorer and leaderboards read

ORDER BY table_name;                    -- sorts all six stacked rows, so both runs list them in the same order
