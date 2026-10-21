{#
  dbt's default names a custom schema "<target schema>_<custom>", e.g.
  "staging_marts". We want exactly the schema each folder asks for (staging,
  marts), so use the custom name as-is and fall back to the target's schema.
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
