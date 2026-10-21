-- One row per current franchise (32): raw.teams without the old codes.
-- raw.teams also lists OAK, SD and STL (relocated) and LAR (a second code for
-- the Rams). Staging maps those codes to today's franchise everywhere else, so
-- here they'd only duplicate a current team.

select
    team_abbr,
    team_name,
    team_nick,
    team_conf          as conference,   -- AFC / NFC (today's alignment)
    team_division      as division,     -- e.g. 'AFC East'
    team_color,
    team_color2,
    team_logo_espn,
    team_logo_squared,
    team_wordmark
from {{ source('raw', 'teams') }}
-- NOT IN against the map's old codes drops the four non-current rows.
where team_abbr not in (select old_code from {{ ref('team_code_map') }})
