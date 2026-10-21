-- The registry's rows and their in_v1 flags, and each row's team_games column.
-- Step 0.30 listed the 12 v1 situations (13 rows: time slot's primetime flag
-- is its own filter). Step 0.39 trimmed surface, primetime and opponent type on
-- evidence (in_v1 false; their data stays in the split marts) and added rest
-- advantage. information_schema.columns is Postgres's own catalogue of every
-- table's columns.
-- Returns any situation that's missing, unexpected, wrongly flagged, or
-- points at no column.

with expected (key, in_v1) as (
    values ('venue', true), ('roof', true), ('surface', false), ('temperature', true),
           ('precipitation', true), ('wind', true), ('time_slot', true), ('primetime', false),
           ('rest', true), ('rest_advantage', true), ('time_zone_travel', true),
           ('body_clock', true), ('opponent_type', false), ('spread_role', true)
)

select e.key, 'missing from the registry, or in_v1 is wrong' as problem
from expected as e
left join {{ ref('situations') }} as s on s.key = e.key
where s.key is null or s.in_v1 <> e.in_v1

union all

select s.key, 'not an expected situation'
from {{ ref('situations') }} as s
left join expected as e on e.key = s.key
where e.key is null

union all

select s.key, 'no team_games column called ' || s.column_name
from {{ ref('situations') }} as s
left join information_schema.columns as c
  on c.table_schema = '{{ ref("team_games").schema }}'
 and c.table_name   = '{{ ref("team_games").identifier }}'
 and c.column_name  = s.column_name
where c.column_name is null
