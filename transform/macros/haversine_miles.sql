{#
  Great-circle distance in miles between two points given in degrees: the
  haversine formula, the shortest path over the Earth's surface. The Earth is
  treated as a sphere of radius 3,958.8 miles (its mean radius); for stadium
  distances that's accurate to well under 1%.

    a = sin²(Δlat / 2) + cos(lat1) · cos(lat2) · sin²(Δlon / 2)
    distance = 2 · R · asin(√a)

  SQL's trig functions work in radians, so every angle goes through radians().
#}
{% macro haversine_miles(lat1, lon1, lat2, lon2) -%}
    2 * 3958.8 * asin(sqrt(
        power(sin(radians({{ lat2 }} - {{ lat1 }}) / 2), 2)
        + cos(radians({{ lat1 }})) * cos(radians({{ lat2 }}))
          * power(sin(radians({{ lon2 }} - {{ lon1 }}) / 2), 2)
    ))
{%- endmacro %}
