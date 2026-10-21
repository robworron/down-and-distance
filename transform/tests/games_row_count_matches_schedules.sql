-- games must keep every game: one row per stg_schedules row, no more, no fewer
-- (an inner join to a missing stadium or team would silently drop games).
-- Returns a row only when the counts differ.

select
    (select count(*) from {{ ref('stg_schedules') }}) as schedules_rows,
    (select count(*) from {{ ref('games') }})         as games_rows
where (select count(*) from {{ ref('stg_schedules') }})
   <> (select count(*) from {{ ref('games') }})
