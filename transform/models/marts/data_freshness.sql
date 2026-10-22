-- How fresh each source is (step 1.6): one row per raw table the pipeline
-- loads, with its last successful load and its last attempt. The site's
-- footer reads the newest schedules success ("Data updated ...").
--
-- Built last: the comments below tell dbt this model depends on every other
-- mart, so it runs after them and is skipped if any of them, or their tests,
-- failed. A failed build never advances the stamp.
--
-- depends_on: {{ ref('games') }}
-- depends_on: {{ ref('team_games') }}
-- depends_on: {{ ref('team_seasons') }}
-- depends_on: {{ ref('team_game_stats') }}
-- depends_on: {{ ref('dim_teams') }}
-- depends_on: {{ ref('dim_stadiums') }}
-- depends_on: {{ ref('mart_team_splits') }}
-- depends_on: {{ ref('mart_league_splits') }}
-- depends_on: {{ ref('situations') }}
--
-- Clause order inside each CTE: FROM -> WHERE -> SELECT -> DISTINCT ON
-- (keeps the first row of each table_name in ORDER BY order).

with loads as (
    select * from {{ source('raw', 'source_loads') }}
),

last_success as (
    -- DISTINCT ON (table_name) keeps one row per table: the first in the
    -- ORDER BY, so the most recent success. run_id breaks a tie in time, so
    -- the same data always gives the same row.
    select distinct on (table_name)
        table_name,
        finished_at as last_success_at,
        seasons as last_success_seasons,
        rows_inserted,
        rows_updated,
        rows_unchanged,
        rows_deleted
    from loads
    where status = 'success'
    order by table_name, finished_at desc, run_id
),

last_attempt as (
    -- The most recent load of each table, success or not.
    select distinct on (table_name)
        table_name,
        finished_at as last_attempt_at,
        status as last_attempt_status
    from loads
    order by table_name, finished_at desc, run_id
)

select
    a.table_name,
    s.last_success_at,          -- NULL if the table has never loaded successfully
    s.last_success_seasons,
    s.rows_inserted,
    s.rows_updated,
    s.rows_unchanged,
    s.rows_deleted,
    a.last_attempt_at,
    a.last_attempt_status       -- 'failed' here, with an older last_success_at, is a source that's behind
from last_attempt as a
left join last_success as s on s.table_name = a.table_name   -- keep tables that have only ever failed
order by a.table_name
