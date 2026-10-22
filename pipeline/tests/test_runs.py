"""Run records and independent loaders (step 1.6).

The first half needs no database: the error sanitizer, and `ingest` with fake
loaders and a fake run log. The second half writes the real tables in a
throwaway schema, so it's local_only like test_upsert.py.
"""

import uuid
from datetime import UTC, datetime

import psycopg
import pytest
from psycopg import errors

from pipeline.__main__ import (
    EXIT_OK,
    EXIT_OPTIONAL_FAILED,
    EXIT_REQUIRED_FAILED,
    ingest,
)
from pipeline.db import UpsertResult, database_url, is_local_database
from pipeline.load_weather import WeatherIncomplete
from pipeline.runs import ERROR_LIMIT, RunLog, sanitize_error

# --- sanitize_error -----------------------------------------------------------


def test_sanitize_error_removes_connection_strings_and_urls():
    e = psycopg.OperationalError('connection to "postgresql://owner:hunter2@ep-x.aws.neon.tech/neondb?sslmode=require" failed')
    out = sanitize_error(e)
    assert "hunter2" not in out and "neon.tech" not in out and "owner" not in out
    assert out.startswith("OperationalError: ") and "<url>" in out
    assert "<url>" in sanitize_error(ValueError("GET https://example.test/x?token=abc failed"))


def test_sanitize_error_removes_secret_pairs():
    out = sanitize_error(RuntimeError("auth failed: password=hunter2 token: abc123 Authorization=Bearer"))
    assert "hunter2" not in out and "abc123" not in out
    assert "password=<removed>" in out and "token: <removed>" in out


def test_sanitize_error_caps_the_length():
    out = sanitize_error(ValueError("x" * 2000))
    assert len(out) == ERROR_LIMIT and out.endswith("…")


# --- ingest with fake loaders ---------------------------------------------------


class FakeRuns:
    def __init__(self):
        self.loads, self.status = [], None

    def start_run(self, trigger, target, git_sha):
        self.trigger, self.target = trigger, target
        return "run-1"

    def record_load(self, run_id, table, seasons, started, finished, result, error):
        self.loads.append((table, seasons, result, error))

    def finish_run(self, run_id, status):
        self.status = status


OK = UpsertResult(1, 2, 3, 0)


def fake_loaders(fail: dict | None = None):
    """Each loader returns OK unless `fail` names an exception for it."""
    fail = fail or {}

    def loader(table):
        def load():
            if table in fail:
                raise fail[table]
            return [OK, OK] if table == "pbp" else OK  # pbp returns one result per season

        return load

    return {t: ([2026] if t != "teams" else None, loader(t)) for t in ["schedules", "teams", "weather", "pbp"]}


ALL = ["schedules", "teams", "weather", "pbp"]


def test_every_table_loads_and_the_run_succeeds():
    runs = FakeRuns()
    assert ingest(ALL, fake_loaders(), runs, "local", "local") == EXIT_OK
    assert runs.status == "success"
    assert [t for t, *_ in runs.loads] == ["schedules", "teams", "game_weather", "pbp"]
    assert runs.loads[3][2] == UpsertResult(2, 4, 6, 0)  # pbp's seasons summed
    assert runs.loads[1][1] is None  # teams has no seasons


def test_an_optional_failure_is_recorded_and_the_others_still_load():
    runs = FakeRuns()
    code = ingest(ALL, fake_loaders({"weather": ConnectionError("boom")}), runs, "local", "local")
    assert code == EXIT_OPTIONAL_FAILED and runs.status == "partial"
    weather = runs.loads[2]
    assert weather[0] == "game_weather" and isinstance(weather[3], ConnectionError) and weather[2] is None
    assert [t for t, _, _, e in runs.loads if e is None] == ["schedules", "teams", "pbp"]


def test_a_schedules_failure_fails_the_run_with_exit_2_but_still_loads_the_rest():
    runs = FakeRuns()
    code = ingest(ALL, fake_loaders({"schedules": RuntimeError("nflverse down")}), runs, "local", "local")
    assert code == EXIT_REQUIRED_FAILED and runs.status == "failed"
    assert len(runs.loads) == 4


def test_simulate_failure_fails_only_that_table():
    runs = FakeRuns()
    code = ingest(ALL, fake_loaders(), runs, "local", "test", simulate_failure="weather")
    assert code == EXIT_OPTIONAL_FAILED
    assert [type(e).__name__ for _, _, _, e in runs.loads if e] == ["SimulatedFailure"]


def test_a_weather_rate_limit_is_a_failure_that_keeps_its_counts():
    partial = UpsertResult(5, 0, 60, 0)
    runs = FakeRuns()
    code = ingest(ALL, fake_loaders({"weather": WeatherIncomplete([2025], partial)}), runs, "local", "local")
    assert code == EXIT_OPTIONAL_FAILED
    table, _, result, error = runs.loads[2]
    assert table == "game_weather" and result == partial and isinstance(error, WeatherIncomplete)


def test_only_loads_the_chosen_tables():
    runs = FakeRuns()
    assert ingest(["teams"], fake_loaders(), runs, "local", "local") == EXIT_OK
    assert [t for t, *_ in runs.loads] == ["teams"]


class BrokenRuns(FakeRuns):
    """Neon ended the connection: writing a run record fails."""

    def record_load(self, *args):
        raise psycopg.errors.AdminShutdown("terminating connection due to administrator command")


def test_a_run_record_that_cant_be_written_is_exit_2():
    # Exit 2, not a crash: the nightly job then skips publishing.
    assert ingest(ALL, fake_loaders(), BrokenRuns(), "local", "local") == EXIT_REQUIRED_FAILED


# --- the real tables, in a throwaway schema --------------------------------------

local = pytest.mark.skipif(not is_local_database(), reason="writes tables; local database only")


def q(query, params=None):
    """Run SQL on a fresh connection; the rows, or [] for a statement."""
    with psycopg.connect(database_url(), autocommit=True) as c:
        cur = c.execute(query, params)
        return cur.fetchall() if cur.description else []


@pytest.fixture
def runlog():
    schema = f"test_runs_{uuid.uuid4().hex[:8]}"
    log = RunLog(schema=schema)
    log.ensure_tables()
    yield log
    q(f"DROP SCHEMA IF EXISTS {schema} CASCADE")


@pytest.mark.local_only
@local
def test_records_a_run_and_its_loads(runlog):
    log = runlog
    log.ensure_tables()  # a second run of run_records.sql changes nothing
    run_id = log.start_run("local", "local", "abc123")
    t = datetime.now(UTC)
    log.record_load(run_id, "schedules", [2026], t, t, UpsertResult(1, 2, 3, 0), None)
    log.record_load(run_id, "game_weather", [2026], t, t, None, RuntimeError("password=hunter2 at postgresql://u:p@h/db"))
    log.finish_run(run_id, "partial")
    run = q(f"SELECT status, finished_at IS NOT NULL, git_sha FROM {log.schema}.pipeline_runs")[0]
    assert run == ("partial", True, "abc123")
    loads = q(f"SELECT table_name, status, rows_updated, error, seasons FROM {log.schema}.source_loads ORDER BY 1")
    assert loads[0][:3] == ("game_weather", "failed", None) and "hunter2" not in loads[0][3] and "<url>" in loads[0][3]
    assert loads[1] == ("schedules", "success", 2, None, [2026])


@pytest.mark.local_only
@local
def test_constraints_refuse_bad_rows(runlog):
    log = runlog
    with pytest.raises(errors.CheckViolation):
        q(f"INSERT INTO {log.schema}.pipeline_runs (run_id, trigger, target, status) VALUES (%s, 'x', 'y', 'done')", [uuid.uuid4()])
    with pytest.raises(errors.ForeignKeyViolation):  # a load must belong to a recorded run
        log.record_load(uuid.uuid4(), "teams", None, datetime.now(UTC), datetime.now(UTC), None, None)
    run_id = log.start_run("local", "local", None)
    t = datetime.now(UTC)
    log.record_load(run_id, "teams", None, t, t, None, None)
    with pytest.raises(errors.UniqueViolation):  # each table once per run
        log.record_load(run_id, "teams", None, t, t, None, None)


@pytest.mark.local_only
@local
def test_a_run_left_running_for_3_hours_is_marked_abandoned(runlog):
    log = runlog
    old = log.start_run("schedule", "test", None)
    recent = log.start_run("schedule", "test", None)
    q(f"UPDATE {log.schema}.pipeline_runs SET started_at = now() - interval '4 hours' WHERE run_id = %s", [old])
    log.start_run("schedule", "test", None)  # the next run tidies up
    statuses = dict(q(f"SELECT run_id, status FROM {log.schema}.pipeline_runs"))
    assert statuses[old] == "abandoned"
    assert statuses[recent] == "running"  # under 3 hours: maybe still going


@pytest.mark.local_only
@local
def test_runlog_reads_database_url_and_keeps_no_connection_open(runlog):
    assert RunLog().url == database_url()
    # Each write opens and closes its own connection, so nothing sits idle
    # for Neon to end during a slow load (found in the test-target rehearsal).
    def mine():
        return q("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()")[0][0]

    before = mine()
    runlog.start_run("local", "local", None)
    assert mine() == before
