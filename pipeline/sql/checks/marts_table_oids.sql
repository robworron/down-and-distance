-- Each mart table's identity (step 1.6). dbt replaces a table by building a
-- new one and swapping it in, and a new table gets a new OID (Postgres's
-- internal object id). So: run this before and after a publish. Every OID
-- changed means the marts were republished; every OID the same means they
-- were left untouched, which is what a failed candidate must guarantee.
--
-- Clause order: FROM/JOIN -> WHERE -> SELECT -> ORDER BY.

SELECT
    c.relname AS table_name,
    c.oid::bigint AS oid,                       -- the identity; ::bigint so it prints as a plain number
    s.n_live_tup AS approx_rows                 -- Postgres's running estimate, enough to spot an empty table
FROM pg_class AS c                              -- the catalogue of every table, index and view
JOIN pg_namespace AS n                          -- schemas, to filter by name
    ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables AS s              -- LEFT: a table with no statistics yet still shows
    ON s.relid = c.oid
WHERE n.nspname = 'marts'
  AND c.relkind = 'r'                           -- 'r' = ordinary table (not an index, view or sequence)
ORDER BY c.relname;
