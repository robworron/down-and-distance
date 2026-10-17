-- Step 2.10 Done-when: all 12 v1 situations are listed (13 rows: time
-- slot's primetime flag is its own filter), and each names a real
-- team_games column. information_schema.columns is Postgres's own catalogue
-- of every table's columns.
-- Returns any situation that's missing, not in v1, or points at no column.

with expected (key) as (
    values ('venue'), ('roof'), ('surface'), ('temperature'), ('precipitation'),
           ('wind'), ('time_slot'), ('primetime'), ('rest'), ('time_zone_travel'),
           ('body_clock'), ('opponent_type'), ('spread_role')
)

select e.key, 'missing from the registry, or not in v1' as problem
from expected as e
left join {{ ref('situations') }} as s on s.key = e.key
where s.key is null or not s.in_v1

union all

select s.key, 'no team_games column called ' || s.column_name
from {{ ref('situations') }} as s
left join information_schema.columns as c
  on c.table_schema = '{{ ref("team_games").schema }}'
 and c.table_name   = '{{ ref("team_games").identifier }}'
 and c.column_name  = s.column_name
where c.column_name is null
