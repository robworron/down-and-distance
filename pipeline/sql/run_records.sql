-- Run records (step 1.6): what each pipeline run did, written by
-- pipeline/runs.py. Safe to run again: every statement is IF NOT EXISTS, so a
-- second run changes nothing. runs.py runs this file at the start of every
-- ingest; tests run it in a throwaway schema by replacing "raw." below.
--
-- Unlike the source copies in raw, these tables have no _loaded_at: their own
-- started_at / finished_at say when each row was written.

CREATE SCHEMA IF NOT EXISTS raw;

-- One row per run of `pipeline ingest`.
CREATE TABLE IF NOT EXISTS raw.pipeline_runs (
    run_id      uuid PRIMARY KEY,                 -- generated in Python, so the loads can reference it at once
    trigger     text NOT NULL,                    -- what started it: schedule, workflow_dispatch or local
    target      text NOT NULL,                    -- which database: production, test or local
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,                      -- NULL while running
    status      text NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'success', 'partial', 'failed', 'abandoned')),
        -- partial: an optional source failed; failed: a required one did;
        -- abandoned: still 'running' 3 hours later (the job died without finishing)
    git_sha     text                              -- the commit the job ran
);

-- One row per table a run tried to load.
CREATE TABLE IF NOT EXISTS raw.source_loads (
    run_id            uuid NOT NULL REFERENCES raw.pipeline_runs (run_id),  -- every load belongs to a recorded run
    table_name        text NOT NULL,              -- schedules, teams, game_weather or pbp
    seasons           int[],                      -- the seasons asked for; NULL for teams (not seasonal)
    status            text NOT NULL CHECK (status IN ('success', 'failed')),
    rows_inserted     int,                        -- the upsert's counts; NULL when nothing reached the upsert
    rows_updated      int,
    rows_unchanged    int,
    rows_deleted      int,
    error             text,                       -- the exception, with URLs and passwords removed, at most 500 characters
    nflreadpy_version text,                       -- the source library's version, to trace changes upstream
    started_at        timestamptz NOT NULL,
    finished_at       timestamptz NOT NULL,
    PRIMARY KEY (run_id, table_name)              -- each table at most once per run
);
