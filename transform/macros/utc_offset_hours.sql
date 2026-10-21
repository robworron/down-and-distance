{#
  How many hours a time zone is ahead of UTC at a given instant, daylight
  saving time included: America/Los_Angeles is -7 in October and -8 in
  December; America/Phoenix is -7 all year.

  `instant AT TIME ZONE zone` reads a timestamptz on that zone's wall clock.
  Reading the same instant on the zone's clock and on UTC's clock, the
  difference between the two readings is the zone's offset.
#}
{% macro utc_offset_hours(instant, zone) -%}
    (extract(epoch from ({{ instant }} at time zone {{ zone }}) - ({{ instant }} at time zone 'UTC')) / 3600)
{%- endmacro %}
