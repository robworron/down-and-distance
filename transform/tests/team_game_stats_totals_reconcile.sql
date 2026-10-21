-- Nothing is lost between the plays and the per-team rows: every
-- interception, lost fumble, sack and accepted penalty in play-by-play is
-- charged to exactly one team in team_game_stats. A join that dropped rows,
-- or a fumble charged to a team code that matches no row, would break this.
-- Returns a row for any total that differs.

with from_plays as (
    select
        sum(interception)                       as interceptions,
        sum(fumble_lost)                        as fumbles_lost,
        sum(sack)                               as sacks,
        count(*) filter (where penalty = 1)     as penalties
    from {{ ref('stg_pbp') }}
),

from_stats as (
    select
        sum(interceptions)                      as interceptions,
        sum(fumbles_lost)                       as fumbles_lost,
        sum(sacks_taken)                        as sacks,
        sum(penalties)                          as penalties
    from {{ ref('team_game_stats') }}
)

select p.*, 'plays' as source from from_plays as p, from_stats as s
where (p.interceptions, p.fumbles_lost, p.sacks, p.penalties)
      is distinct from (s.interceptions, s.fumbles_lost, s.sacks, s.penalties)
