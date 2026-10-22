"""`pipeline publish` (step 1.6).

The first half drives publish() with a fake database, gate and dbt, to check
the order of the stages and every exit code. The second half uses the real
lock and fingerprint on a throwaway schema in the local database (local_only).
The full mechanism, with real dbt builds, is rehearsed separately
(docs/decisions.md, "Nightly refresh").
"""

import threading
import time
import uuid

import pandas as pd
import psycopg
import pytest
from psycopg import errors

from pipeline import publish as p
from pipeline.db import database_url, is_local_database, upsert_dataframe

# --- publish() with fakes ---------------------------------------------------------


class FakeDb:
    def __init__(self, raw_changes=False, counts_differ=False, values_differ=False, lock_fails=False, lost=None):
        self.calls, self.oids = [], {"games": 1, "team_games": 2}
        self.raw_changes, self.counts_differ, self.values_differ, self.lock_fails = raw_changes, counts_differ, values_differ, lock_fails
        self.lost = lost  # "before" or "after" the real build: the lock's session drops
        self.fingerprints = 0

    def alive(self):
        self.calls.append("alive")
        return self.lost != "before"

    def lock_raw(self):
        self.calls.append("lock")
        if self.lock_fails:
            raise errors.LockNotAvailable("busy")
        return ["schedules", "pbp"]

    def fingerprint(self):
        self.fingerprints += 1
        if self.lost == "after" and self.fingerprints > 1:
            raise psycopg.OperationalError("server closed the connection unexpectedly")
        return {"schedules": (10 + (self.raw_changes and self.fingerprints > 1), None)}

    def table_oids(self, schema="marts"):
        return dict(self.oids)

    def row_counts(self, schema):
        return {"games": 5, "team_games": 10 + (self.counts_differ and schema != "marts")}

    def differing_tables(self, a, b):
        self.calls.append("compare")
        return ["team_games"] if self.values_differ else []

    def commit(self):
        self.calls.append("commit")

    def rollback(self):
        self.calls.append("rollback")


def run(db, gate=True, candidate=True, published=True, **kwargs):
    builds = []

    def fake_gate():
        db.calls.append("gate")
        return gate

    def fake_dbt(variables, full_refresh):
        builds.append((variables, full_refresh))
        is_candidate = bool(variables and variables.get("schema_suffix"))
        db.calls.append("candidate" if is_candidate else "publish")
        if not is_candidate:
            db.oids = {"games": 11, "team_games": 12}  # dbt replaces each table
        return candidate if is_candidate else published

    return p.publish(db, gate=fake_gate, dbt=fake_dbt, **kwargs), builds


def test_runs_lock_gate_candidate_publish_then_commits():
    db = FakeDb()
    code, builds = run(db)
    assert code == p.PUBLISHED
    assert db.calls == ["lock", "gate", "candidate", "alive", "publish", "commit"]
    assert builds == [({"schema_suffix": "_candidate"}, False), (None, False)]


def test_a_failed_gate_builds_nothing():
    db = FakeDb()
    code, builds = run(db, gate=False)
    assert code == p.GATE_FAILED and builds == [] and db.calls == ["lock", "gate", "rollback"]


def test_a_failed_candidate_never_reaches_the_publish_stage():
    db = FakeDb()
    code, _ = run(db, candidate=False)
    assert code == p.CANDIDATE_FAILED
    assert db.calls == ["lock", "gate", "candidate", "rollback"]
    assert db.oids == {"games": 1, "team_games": 2}  # marts untouched


def test_the_simulated_test_failure_reaches_the_candidate_only():
    db = FakeDb()
    _, builds = run(db, simulate_test_failure=True)
    assert builds[0][0] == {"schema_suffix": "_candidate", "simulate_test_failure": True}
    assert builds[1][0] is None


def test_a_failed_publish_stage_is_exit_2():
    db = FakeDb()
    code, _ = run(db, published=False)
    assert code == p.PUBLISH_FAILED and db.calls[-1] == "rollback"


@pytest.mark.parametrize("kind", ["raw_changes", "counts_differ"])
def test_an_equivalence_failure_is_exit_3_after_publishing(kind):
    db = FakeDb(**{kind: True})
    code, _ = run(db)
    assert code == p.MISMATCH and "commit" in db.calls


def test_compare_checks_every_value():
    db = FakeDb(values_differ=True)
    code, _ = run(db, compare=True)
    assert code == p.MISMATCH and "compare" in db.calls
    assert run(FakeDb(), compare=True)[0] == p.PUBLISHED


def test_no_lock_is_exit_5_with_nothing_built():
    db = FakeDb(lock_fails=True)
    code, builds = run(db)
    assert code == p.NOT_LOCKED and builds == [] and db.calls == ["lock", "rollback"]


def test_a_lock_lost_before_the_real_build_publishes_nothing():
    db = FakeDb(lost="before")
    code, builds = run(db)
    assert code == p.NOT_LOCKED
    assert [v for v, _ in builds] == [{"schema_suffix": "_candidate"}]  # the real build never ran
    assert db.oids == {"games": 1, "team_games": 2}


def test_a_lock_lost_during_the_real_build_is_exit_3():
    db = FakeDb(lost="after")
    code, _ = run(db)
    assert code == p.MISMATCH and "publish" in db.calls


def test_full_refresh_reaches_both_builds():
    _, builds = run(FakeDb(), full_refresh=True)
    assert [f for _, f in builds] == [True, True]


def test_frames_match_allows_float_rounding_only():
    a = pd.DataFrame({"k": [1, 2], "epa": [-18.86208409073272, 0.5], "t": [None, "x"]})
    b = pd.DataFrame({"k": [1, 2], "epa": [-18.862084090732715, 0.5], "t": [None, "x"]})
    assert p.frames_match(a, b)
    assert not p.frames_match(a, b.assign(epa=[-18.8621, 0.5]))
    assert not p.frames_match(a, b.assign(t=["x", "x"]))
    assert p.frames_match(pd.DataFrame({"d": [pd.NaT]}), pd.DataFrame({"d": [pd.NaT]}))


# --- the real lock and fingerprint, in a throwaway schema ----------------------------

local = pytest.mark.skipif(not is_local_database(), reason="writes tables; local database only")


@pytest.fixture
def raw_schema():
    name = f"test_publish_{uuid.uuid4().hex[:8]}"
    df = pd.DataFrame({"game_id": ["a", "b"], "season": pd.array([2026, 2026], dtype="Int64"), "score": pd.array([1, 2], dtype="Int16")})
    upsert_dataframe(df, "games", ["game_id"], scope_col="season", scope_values=[2026], schema=name)
    yield name
    with psycopg.connect(database_url(), autocommit=True) as c:
        c.execute(f"DROP SCHEMA IF EXISTS {name} CASCADE")


@pytest.mark.local_only
@local
def test_an_upsert_changes_the_fingerprint_and_a_read_doesnt(raw_schema):
    with psycopg.connect(database_url(), autocommit=True) as c:
        db = p.PublishDb(c, raw_schema=raw_schema)
        before = db.fingerprint()
        c.execute(f"SELECT * FROM {raw_schema}.games").fetchall()
        assert db.fingerprint() == before
        changed = pd.DataFrame({"game_id": ["a", "b"], "season": pd.array([2026, 2026], dtype="Int64"), "score": pd.array([1, 3], dtype="Int16")})
        upsert_dataframe(changed, "games", ["game_id"], scope_col="season", scope_values=[2026], schema=raw_schema)
        after = db.fingerprint()
    assert after["games"][0] == before["games"][0]  # same rows...
    assert after["games"][1] > before["games"][1]  # ...but a newer _loaded_at


@pytest.mark.local_only
@local
def test_the_share_lock_makes_a_concurrent_insert_wait(raw_schema):
    with psycopg.connect(database_url()) as holder:
        db = p.PublishDb(holder, raw_schema=raw_schema)
        assert db.lock_raw() == ["games"]
        with psycopg.connect(database_url(), autocommit=True) as writer:
            writer.execute("SET lock_timeout = '1s'")
            with pytest.raises(errors.LockNotAvailable):
                writer.execute(f"INSERT INTO {raw_schema}.games (game_id, season, score) VALUES ('c', 2026, 3)")
            # A reader isn't blocked.
            assert writer.execute(f"SELECT count(*) FROM {raw_schema}.games").fetchone()[0] == 2
        db.rollback()


@pytest.mark.local_only
@local
def test_the_lock_waits_for_a_write_in_progress(raw_schema):
    writer = psycopg.connect(database_url())
    writer.execute(f"INSERT INTO {raw_schema}.games (game_id, season, score) VALUES ('c', 2026, 3)")  # not committed
    with psycopg.connect(database_url()) as holder:
        db = p.PublishDb(holder, raw_schema=raw_schema)
        with pytest.raises(errors.LockNotAvailable):
            db.lock_raw(timeout="1s")
        db.rollback()
        threading.Thread(target=lambda: (time.sleep(0.5), writer.commit())).start()
        started = time.monotonic()
        db.lock_raw(timeout="5s")  # waits for the commit, then sees its row
        assert time.monotonic() - started >= 0.4
        assert db.fingerprint()["games"][0] == 3
        db.rollback()
    writer.close()


@pytest.mark.local_only
@local
def test_the_lock_transaction_outlives_neons_idle_limit(raw_schema):
    with psycopg.connect(database_url()) as holder:
        db = p.PublishDb(holder, raw_schema=raw_schema)
        db.lock_raw()
        assert holder.execute("SHOW idle_in_transaction_session_timeout").fetchone()[0] == p.IDLE_IN_TRANSACTION_LIMIT
        db.rollback()


@pytest.mark.local_only
@local
def test_a_killed_lock_session_stops_publish_before_the_real_build(raw_schema):
    """The lock's session dies during the candidate (as Neon's idle timeout would do)."""
    holder = psycopg.connect(database_url())
    db = p.PublishDb(holder, raw_schema=raw_schema)
    pid = None
    builds = []

    def gate():
        nonlocal pid
        pid = holder.execute("SELECT pg_backend_pid()").fetchone()[0]
        return True

    def dbt(variables, full_refresh):
        builds.append(variables)
        if variables:  # the candidate: meanwhile, the server ends the lock's session
            with psycopg.connect(database_url(), autocommit=True) as admin:
                admin.execute("SELECT pg_terminate_backend(%s)", [pid])
            time.sleep(0.5)
        return True

    assert p.publish(db, gate=gate, dbt=dbt) == p.NOT_LOCKED
    assert builds == [{"schema_suffix": "_candidate"}]  # the real build never ran
    holder.close()
