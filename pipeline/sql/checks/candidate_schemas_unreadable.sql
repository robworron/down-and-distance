-- Can the website's role reach the candidate schemas? (step 1.6)
-- `pipeline publish` builds a full test copy in staging_candidate and
-- marts_candidate before touching the real marts. The site must never read
-- that copy: web_reader's grants and default privileges are on marts only.
-- Expected: both rows exist, with every privilege false. marts is shown for
-- contrast (usage true).
--
-- Run as the owner. has_schema_privilege(role, schema, privilege) asks
-- Postgres whether that role holds that privilege, without connecting as it.
-- Clause order: FROM -> WHERE -> SELECT -> ORDER BY.

SELECT
    n.nspname AS schema_name,
    has_schema_privilege('web_reader', n.oid, 'USAGE') AS web_reader_usage,      -- needed to touch anything inside
    has_schema_privilege('web_reader', n.oid, 'CREATE') AS web_reader_create,
    (
        SELECT count(*)                         -- tables in the schema web_reader could SELECT from
        FROM pg_class AS c
        WHERE c.relnamespace = n.oid
          AND c.relkind = 'r'
          AND has_table_privilege('web_reader', c.oid, 'SELECT')
    ) AS web_reader_readable_tables
FROM pg_namespace AS n
WHERE n.nspname IN ('staging_candidate', 'marts_candidate', 'marts')   -- the two candidates, and marts for contrast
ORDER BY n.nspname;
