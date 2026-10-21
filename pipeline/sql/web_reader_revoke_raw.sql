-- The "contract" half of step 0.40: web_reader stops reading the raw schema.
-- From the first deploy (step 0.9) to step 0.40 the site read raw.schedules, so web_reader had
-- SELECT on every raw table, kept through reloads by default privileges.
-- Run only after the site that reads marts is live (see web_reader.sql).
-- REVOKE of something not granted does nothing, so this is safe to rerun.

-- Stop granting SELECT on tables the owner creates in raw from now on...
ALTER DEFAULT PRIVILEGES IN SCHEMA raw REVOKE SELECT ON TABLES FROM web_reader;
-- ...take it back from the tables that exist...
REVOKE SELECT ON ALL TABLES IN SCHEMA raw FROM web_reader;
-- ...and stop the role looking inside the schema at all.
REVOKE USAGE ON SCHEMA raw FROM web_reader;
