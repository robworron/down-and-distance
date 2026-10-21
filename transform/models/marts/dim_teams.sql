-- One row per current franchise (32): the teams the site lists and links to.
-- A "dimension" table: it describes things (names, divisions, colours) that
-- the split marts, which hold measurements, refer to by team code.
--
-- Colours only, never logos or wordmarks: the site shows team colours and
-- abbreviation badges, not NFL team logos, which are trademarks (step 0.42).

select
    team_abbr,
    team_name,                         -- e.g. Buffalo Bills
    team_nick,                         -- e.g. Bills
    conference,                        -- AFC / NFC, today's alignment
    division,                          -- e.g. AFC East
    -- nflverse mixes upper- and lower-case hex; one case keeps them comparable.
    upper(team_color)  as team_color,  -- primary, e.g. #00338D
    upper(team_color2) as team_color2  -- secondary
from {{ ref('stg_teams') }}
