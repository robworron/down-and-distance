-- What the most recent pipeline run did, table by table (step 1.6).
-- One row per table the run tried to load: its status, row counts and
-- (sanitized) error. Run it after the nightly job, or after a rehearsal, to
-- see exactly what was recorded.
--
-- Clause order: FROM/JOIN -> WHERE -> SELECT -> ORDER BY. The subquery in
-- WHERE runs first and picks the one run to show.

SELECT
    r.run_id,
    r.trigger,                                  -- schedule, workflow_dispatch or local
    r.target,                                   -- production, test or local
    r.status AS run_status,                     -- success, partial, failed, abandoned (or running)
    l.table_name,
    l.status AS load_status,                    -- success or failed
    l.seasons,
    l.rows_inserted,
    l.rows_updated,
    l.rows_unchanged,
    l.rows_deleted,
    l.error,                                    -- NULL on success
    l.finished_at - l.started_at AS took        -- subtracting timestamps gives an interval
FROM raw.pipeline_runs AS r
JOIN raw.source_loads AS l                      -- an inner join: a run that loaded nothing shows no rows
    ON l.run_id = r.run_id
WHERE r.run_id = (                              -- a scalar subquery: exactly one value, the newest run
    SELECT run_id
    FROM raw.pipeline_runs
    ORDER BY started_at DESC                    -- newest first...
    LIMIT 1                                     -- ...and keep only it
)
ORDER BY l.started_at;                          -- the tables in the order they loaded
