{#
  dbt's default names a custom schema "<target schema>_<custom>", e.g.
  "staging_marts". We want exactly the schema each folder asks for (staging,
  marts), so use the custom name as-is and fall back to the target's schema.

  `--vars '{schema_suffix: _candidate}'` appends a suffix to every schema, so
  `pipeline publish` can build and test a whole candidate copy (staging_candidate,
  marts_candidate) before touching the real marts. Sources keep their own
  schema (raw), so both builds read the same raw tables. With no var the names
  are exactly as before.
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- set suffix = var('schema_suffix', '') -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}{{ suffix }}
    {%- else -%}
        {{ custom_schema_name | trim }}{{ suffix }}
    {%- endif -%}
{%- endmacro %}
