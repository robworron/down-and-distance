-- web_reader: the website's login. It can read the tables in the marts schema
-- and nothing else (least privilege, step 0.40). The password is set
-- separately by pipeline/create_web_reader.py, which runs this file as the
-- database owner.
--
-- Step 0.40 moved web_reader from raw to marts in two halves, so the live site
-- never lost access to what it was reading:
--   1. "expand" (this file): add marts, leave any older access alone;
--   2. deploy the site that reads marts;
--   3. "contract" (web_reader_revoke_raw.sql): remove raw.
-- On a fresh database this file alone is the final state. It needs the
-- marts schema, so run it after the first dbt build. Safe to rerun.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_reader') THEN
        CREATE ROLE web_reader LOGIN;
    END IF;
END
$$;

-- Belt and braces: every session this role opens is read-only.
ALTER ROLE web_reader SET default_transaction_read_only = on;

-- USAGE lets the role look inside the schema; SELECT reads its tables.
GRANT USAGE ON SCHEMA marts TO web_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA marts TO web_reader;

-- dbt rebuilds every mart table on each run (it builds a new table, swaps it
-- in and drops the old one), and a dropped table takes its grants with it.
-- Default privileges make each new table in marts readable by web_reader the
-- moment it's created. They cover tables created by the role that runs this
-- statement, so this file must run as the same role that runs dbt.
ALTER DEFAULT PRIVILEGES IN SCHEMA marts GRANT SELECT ON TABLES TO web_reader;
