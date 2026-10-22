-- A test that fails only on request, to rehearse a failing build (step 1.6):
--   uv run python -m pipeline publish --simulate-test-failure
-- passes `simulate_test_failure: true` to the candidate build only, so the
-- candidate fails and the real marts must stay untouched. Without the var
-- this returns no rows, and a dbt test passes when it returns none.

select 'simulated test failure' as reason
where {{ 'true' if var('simulate_test_failure', false) else 'false' }}
