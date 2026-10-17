-- Every game with play-by-play appears exactly twice in team_game_stats,
-- once per team, and each row's defense is the other row's offense.
-- Returns any game that breaks either rule.

with counts as (
    select p.game_id, count(distinct s.team) as team_rows
    from (select distinct game_id from {{ ref('stg_pbp') }}) as p
    -- LEFT JOIN so a game missing from team_game_stats shows up with 0 rows.
    left join {{ ref('team_game_stats') }} as s on s.game_id = p.game_id
    group by p.game_id
)

select game_id, 'not two rows' as problem
from counts
where team_rows <> 2

union all

select a.game_id, 'defense is not the opponent''s offense'
from {{ ref('team_game_stats') }} as a
join {{ ref('team_game_stats') }} as b
  on b.game_id = a.game_id and b.team = a.opponent
where a.def_plays  <> b.plays
   or a.def_yards  <> b.yards
   or a.def_epa    is distinct from b.epa
   or a.takeaways  <> b.turnovers
   or a.sacks      <> b.sacks_taken
