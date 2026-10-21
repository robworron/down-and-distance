-- One row per stadium in the stadiums seed (69): the home-field facts the
-- team page shows. The seed lives in staging, which the website can't read,
-- so this mart exposes the columns it needs (step 0.43).

select
    stadium_id,

    -- The seed adds a bracketed note to 14 names: a former name, as in
    -- 'Highmark Stadium (Ralph Wilson Stadium)', or which one, as in
    -- 'Tiger Stadium (LSU)'. The site shows the current name only, so
    -- regexp_replace deletes a bracketed part at the end of the name, with
    -- the space before it: \s* is any spaces, \(.*\) the brackets and
    -- everything inside, $ the end of the text.
    regexp_replace(name, '\s*\(.*\)$', '')         as stadium_name,

    city,
    region,                                         -- state or province
    country,                                        -- ISO code, e.g. US
    timezone,                                       -- IANA, e.g. America/New_York
    altitude_m,
    roof,                                           -- outdoors / dome / retractable
    surface,                                        -- nflverse's term, e.g. fieldturf

    -- Same rule as games.surface_type: dessograss is grass stitched with
    -- synthetic fibres, so it counts as grass.
    case when surface in ('grass', 'dessograss') then 'grass' else 'turf' end as surface_type
from {{ ref('stadiums') }}
