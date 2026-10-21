-- The registry's display columns (step 0.44) agree with the rest of the row:
--   - tier is set exactly when the situation is in v1;
--   - value_labels has one label per value in value_list;
--   - every shared value is one of the situation's values, and only
--     team-level situations have them (in a game-level situation every value
--     is shared, so the site never compares win % there anyway);
--   - shrinkage_k is a positive number of games.
-- Returns each row that breaks a rule, with the problem.

with registry as (
    select
        key,
        level,
        in_v1,
        tier,
        shrinkage_k,
        shared_values,
        -- string_to_array splits 'home|away|neutral' into an array;
        -- cardinality counts its elements.
        string_to_array(value_list, '|')   as values_arr,
        string_to_array(value_labels, '|') as labels_arr,
        string_to_array(shared_values, '|') as shared_arr
    from {{ ref('situations') }}
)

select key, 'tier is set exactly when in_v1' as problem
from registry
where (tier is not null) <> in_v1

union all

select key, 'value_labels has ' || cardinality(labels_arr) || ' labels for '
            || cardinality(values_arr) || ' values'
from registry
where cardinality(labels_arr) <> cardinality(values_arr)

union all

-- <@ is array containment: every element on the left is in the right.
select key, 'shared_values not all in value_list'
from registry
where shared_values is not null and not (shared_arr <@ values_arr)

union all

select key, 'shared_values on a game-level situation'
from registry
where shared_values is not null and level <> 'team'

union all

select key, 'shrinkage_k must be positive'
from registry
where shrinkage_k <= 0
