-- web_reader: the website's login. It can read tables in the raw schema and
-- nothing else (least privilege). In step 4.1 it moves to marts only.
-- The password is set separately by pipeline/create_web_reader.py.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_reader') THEN
        CREATE ROLE web_reader LOGIN;
    END IF;
END
$$;

-- Belt and braces: every session this role opens is read-only.
ALTER ROLE web_reader SET default_transaction_read_only = on;

GRANT USAGE ON SCHEMA raw TO web_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA raw TO web_reader;

-- The loader replaces raw tables, which drops their grants, so make every
-- table the loading role creates in raw readable by web_reader automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA raw GRANT SELECT ON TABLES TO web_reader;
