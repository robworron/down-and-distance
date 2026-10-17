-- The 2020 regular-season home record, reconciled with the published one.
-- Published: home teams went 127-128-1 (.498) in 256 games. That count
-- includes the 49ers' three "home" games in Glendale, Arizona (weeks 13, 14
-- and 17, all losses), played there because of Santa Clara County's COVID
-- rules. nflverse lists those as neutral-site games, so here they are
-- venue = 'neutral', not 'home':
--   home (league):    253 games, 127-125-1, (127 + 0.5) / 253 = .504
--   SF neutral:         3 games,   0-3-0
--   together:         256 games, 127-128-1, (127 + 0.5) / 256 = .498
-- They are the only neutral-site regular-season games of 2020, so the
-- league's neutral row is those 3 games seen from both sides: 6 team-games.
-- Returns a row for any figure that disagrees, or is missing.

with expected (source, team, situation_value, games, wins, losses, ties) as (
    values
        ('league', null,  'home',    253, 127, 125, 1),
        ('league', null,  'neutral',   6,   3,   3, 0),
        ('team',   'SF',  'neutral',   3,   0,   3, 0)
),

actual as (
    select 'league' as source, null as team, situation_value, games, wins, losses, ties
    from {{ ref('mart_league_splits') }}
    where season = 2020 and season_type = 'REG' and situation_key = 'venue'

    union all

    select 'team', team, situation_value, games, wins, losses, ties
    from {{ ref('mart_team_splits') }}
    where season = 2020 and season_type = 'REG' and situation_key = 'venue'
      and team = 'SF' and situation_value = 'neutral'
)

select e.*, a.games as actual_games, a.wins as actual_wins,
       a.losses as actual_losses, a.ties as actual_ties
from expected as e
left join actual as a
  on a.source = e.source
 and a.team is not distinct from e.team
 and a.situation_value = e.situation_value
where a.games is null
   or a.games <> e.games
   or a.wins <> e.wins
   or a.losses <> e.losses
   or a.ties <> e.ties
