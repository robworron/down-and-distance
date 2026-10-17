-- Step 2.11 Done-when: 2020, played in mostly empty stadiums, has the lowest
-- regular-season home win % of any complete season since 1999.
-- Win % = (wins + half the ties) / games, the NFL standings definition.
-- Returns any other season at or below 2020, or a row if 2020 is missing.

with complete_seasons as (
    -- Seasons whose regular season has been played to the end. BOOL_AND is
    -- true only if every game in the group is finished; the season in
    -- progress drops out until its last regular-season game.
    select season
    from {{ ref('games') }}
    where not is_playoff
    group by season
    having bool_and(is_finished)
),

home as (
    select
        season,
        (wins + 0.5 * ties) / games as win_pct
    from {{ ref('mart_league_splits') }}
    where season_type = 'REG'
      and situation_key = 'venue'
      and situation_value = 'home'
      and season in (select season from complete_seasons)
)

select h.season, h.win_pct, y2020.win_pct as win_pct_2020
from home as h
cross join (select win_pct from home where season = 2020) as y2020
where h.season <> 2020
  and h.win_pct <= y2020.win_pct

union all

-- Without this, a missing 2020 would make the CROSS JOIN empty and pass.
select 2020, null, null
where not exists (select 1 from home where season = 2020)
