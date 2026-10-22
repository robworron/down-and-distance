"""Publish the marts only after the same build has passed every check.

    uv run python -m pipeline publish                          # the nightly job's build
    uv run python -m pipeline publish --compare                # rehearsals: also compare every value
    uv run python -m pipeline publish --simulate-test-failure  # rehearsals: fail the candidate on purpose
    uv run python -m pipeline publish --full-refresh           # passed to both dbt builds

Everything below runs while one transaction holds a SHARE lock on every
table in raw. Postgres lets readers through (dbt, pytest) but makes every
INSERT, UPDATE, DELETE, TRUNCATE or ALTER wait until the lock is released,
from any connection, so every query of both builds sees the same raw rows
(tested in an isolated database: docs/decisions.md, "Nightly refresh").

1. Lock raw (lock_timeout 5 min) and record its fingerprint F0: per table,
   the row count and the latest load time.
2. The raw gate: test_raw_data.py, minus the advisory checks.
3. The candidate: a full dbt build into staging_candidate / marts_candidate,
   every test included. The site can't read those schemas.
4. Only if 2 and 3 were clean: the real dbt build into staging / marts.
5. Checks: raw's fingerprint F1 must equal F0 (the lock held), and every
   mart must have the candidate's row count (--compare: every value).
6. Commit, releasing the lock.

Exit codes:
  0 published                    marts replaced
  1 the candidate failed         marts untouched (table identities checked)
  2 the publish stage failed     marts partly replaced, each a tested version
  3 an equivalence check failed  published; investigate
  4 the raw gate failed          marts untouched
  5 the lock wasn't acquired     marts untouched

The connection must be Postgres's own (Neon's direct host), not a pooler that
could move the transaction, and the lock's holder never writes to raw itself.
Run records are written by `ingest`, before this starts.
"""

import argparse
import json
import logging
import math
import subprocess
import sys
import time
from collections.abc import Callable

import pandas as pd
import psycopg
from dotenv import load_dotenv
from psycopg import errors, sql

from pipeline.db import database_url, is_local_database

log = logging.getLogger("pipeline.publish")

PUBLISHED, CANDIDATE_FAILED, PUBLISH_FAILED, MISMATCH, GATE_FAILED, NOT_LOCKED = 0, 1, 2, 3, 4, 5
CANDIDATE_SUFFIX = "_candidate"
LOCK_TIMEOUT = "5min"
# Neon ends a session left idle inside a transaction for 5 minutes, and the
# lock's session is idle while dbt builds. Raised for this one transaction,
# below the nightly job's 45-minute limit (a dead job's connection closes,
# and its lock goes with it).
IDLE_IN_TRANSACTION_LIMIT = "40min"
RELATIVE_TOLERANCE = 1e-9  # --compare: floating-point sums may differ in the last bits


class PublishDb:
    """The lock transaction and the catalogue reads publish() needs."""

    def __init__(self, conn: psycopg.Connection, raw_schema: str = "raw"):
        self.conn = conn  # autocommit off: everything below is one transaction until commit()
        self.raw = raw_schema  # "raw", except in tests

    def lock_raw(self, timeout: str = LOCK_TIMEOUT) -> list[str]:
        """SHARE-lock every table in raw, read from the catalogue so new raw tables are covered."""
        self.conn.execute(sql.SQL("SET LOCAL lock_timeout = {}").format(sql.Literal(timeout)))
        self.conn.execute(sql.SQL("SET LOCAL idle_in_transaction_session_timeout = {}").format(sql.Literal(IDLE_IN_TRANSACTION_LIMIT)))
        tables = [r[0] for r in self.conn.execute("SELECT tablename FROM pg_tables WHERE schemaname = %s ORDER BY tablename", [self.raw])]
        names = sql.SQL(", ").join(sql.Identifier(self.raw, t) for t in tables)
        self.conn.execute(sql.SQL("LOCK TABLE {} IN SHARE MODE").format(names))
        return tables

    def fingerprint(self) -> dict[str, tuple]:
        """Per raw table: rows, and the latest load time (_loaded_at, or the run records' times)."""
        out = {}
        for (table,) in self.conn.execute("SELECT tablename FROM pg_tables WHERE schemaname = %s ORDER BY tablename", [self.raw]).fetchall():
            columns = {r[0] for r in self.conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema = %s AND table_name = %s", [self.raw, table])}  # fmt: skip
            if "_loaded_at" in columns:
                latest = sql.SQL("max(_loaded_at)")
            elif {"started_at", "finished_at"} <= columns:
                latest = sql.SQL("max(greatest(started_at, finished_at))")
            else:
                latest = sql.SQL("NULL")
            row = self.conn.execute(sql.SQL("SELECT count(*), {} FROM {}").format(latest, sql.Identifier(self.raw, table))).fetchone()
            out[table] = (row[0], row[1])
        return out

    def table_oids(self, schema: str = "marts") -> dict[str, int]:
        """Each table's identity: dbt replaces a table by creating a new one, so a new OID."""
        rows = self.conn.execute(
            "SELECT c.relname, c.oid::bigint FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = %s AND c.relkind IN ('r', 'p') ORDER BY 1",
            [schema],
        )
        return dict(rows.fetchall())

    def row_counts(self, schema: str) -> dict[str, int]:
        return {t: self.conn.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(schema, t))).fetchone()[0] for t in self.table_oids(schema)}

    def differing_tables(self, a: str, b: str) -> list[str]:
        """Tables whose values differ between two schemas, floats within RELATIVE_TOLERANCE."""
        differ = []
        for table in self.table_oids(a):
            frames = []
            for schema in (a, b):
                q = sql.SQL("SELECT * FROM {}").format(sql.Identifier(schema, table)).as_string(self.conn)
                cur = self.conn.execute(q)
                frame = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])
                # Row order isn't defined, so sort by each row's text (array
                # columns can't be sorted directly); keys come first, so this
                # pairs the same rows on both sides.
                keys = pd.Series(["|".join(map(str, row)) for row in frame.itertuples(index=False, name=None)])
                order = keys.sort_values(kind="mergesort").index
                frames.append(frame.loc[order].reset_index(drop=True))
            if not frames_match(*frames):
                differ.append(table)
        return differ

    def alive(self) -> bool:
        """True if the lock's session is still there (if it isn't, neither is the lock)."""
        try:
            self.conn.execute("SELECT 1")
            return True
        except psycopg.Error:
            return False

    def commit(self) -> None:
        self.conn.commit()

    def rollback(self) -> None:
        try:
            self.conn.rollback()
        except psycopg.Error:
            pass  # the session is already gone, and its transaction with it


def _missing(v) -> bool:
    """NULL as pandas reads it: None, NaN, NaT or NA (all unequal to themselves). Arrays are values."""
    if isinstance(v, (list, tuple, dict)):
        return False
    return bool(pd.isna(v))


def frames_match(x: pd.DataFrame, y: pd.DataFrame) -> bool:
    """Same shape, same columns, every value equal (floats within RELATIVE_TOLERANCE)."""
    if list(x.columns) != list(y.columns) or len(x) != len(y):
        return False
    for column in x.columns:
        for p, q in zip(x[column], y[column], strict=True):
            if _missing(p) or _missing(q):
                if not (_missing(p) and _missing(q)):
                    return False
            elif isinstance(p, float) or isinstance(q, float):
                if not math.isclose(float(p), float(q), rel_tol=RELATIVE_TOLERANCE, abs_tol=1e-12):
                    return False
            elif p != q:
                return False
    return True


def run_gate() -> bool:
    """The raw gate: every raw data check but the advisory ones, against DATABASE_URL."""
    log.info("raw gate: pytest test_raw_data.py -m 'not advisory'")
    cmd = [sys.executable, "-m", "pytest", "pipeline/tests/test_raw_data.py", "-m", "not advisory", "-q", "-p", "no:cacheprovider"]
    return subprocess.run(cmd, check=False).returncode == 0


def run_dbt_build(variables: dict | None, full_refresh: bool) -> bool:
    """One `dbt build` in its own process (pipeline/run_dbt.py), so each build starts clean."""
    args = [sys.executable, "-m", "pipeline", "dbt", "build"]
    if variables:
        args += ["--vars", json.dumps(variables)]
    if full_refresh:
        args.append("--full-refresh")
    log.info("dbt build%s", f" --vars {json.dumps(variables)}" if variables else "")
    return subprocess.run(args, check=False).returncode == 0


def publish(
    db: PublishDb,
    gate: Callable[[], bool] = run_gate,
    dbt: Callable[[dict | None, bool], bool] = run_dbt_build,
    simulate_test_failure: bool = False,
    compare: bool = False,
    full_refresh: bool = False,
) -> int:
    """Gate, candidate, publish, checks, all under the lock; returns an exit code."""
    started = time.monotonic()
    try:
        tables = db.lock_raw()
    except errors.LockNotAvailable:
        db.rollback()
        log.error("couldn't lock raw within %s (a load is still writing): nothing built, marts untouched", LOCK_TIMEOUT)
        return NOT_LOCKED
    f0 = db.fingerprint()
    oids = db.table_oids()
    log.info("raw locked (%d tables, %s rows); marts has %d tables", len(tables), f"{sum(c for c, _ in f0.values()):,}", len(oids))

    def untouched(code: int, why: str) -> int:
        try:
            after = db.table_oids()
        except psycopg.Error:
            # The lock's session is gone; the real build never ran, so nothing replaced the marts.
            log.error("%s: the real build never ran (marts untouched; couldn't recheck their identities)", why)
            return code
        if after == oids:
            log.error("%s: marts untouched (%d tables, same identities)", why, len(oids))
        else:
            log.error("%s, and marts changed unexpectedly: %s", why, sorted(t for t in set(oids) | set(after) if oids.get(t) != after.get(t)))
        db.rollback()
        return code

    if not gate():
        return untouched(GATE_FAILED, "raw gate failed")

    candidate_vars = {"schema_suffix": CANDIDATE_SUFFIX}
    if simulate_test_failure:
        candidate_vars["simulate_test_failure"] = True
    if not dbt(candidate_vars, full_refresh):
        return untouched(CANDIDATE_FAILED, "candidate build failed")

    # The real build only runs while the lock is still held.
    if not db.alive():
        log.error("the lock's session was lost during the checks: raw wasn't frozen, so nothing is published (marts untouched)")
        return NOT_LOCKED

    if not dbt(None, full_refresh):
        db.rollback()
        log.error("publish build failed: some marts may be new and others old; each passed the candidate's tests")
        return PUBLISH_FAILED

    problems = []
    replaced = 0
    try:
        f1 = db.fingerprint()
        if f1 != f0:
            problems.append(f"raw changed under the lock: {sorted(t for t in set(f0) | set(f1) if f0.get(t) != f1.get(t))}")
        published, candidate = db.row_counts("marts"), db.row_counts(f"marts{CANDIDATE_SUFFIX}")
        if published != candidate:
            problems.append(f"row counts differ: {sorted(t for t in set(published) | set(candidate) if published.get(t) != candidate.get(t))}")
        if compare:
            differ = db.differing_tables("marts", f"marts{CANDIDATE_SUFFIX}")
            log.info("compare: %d of %d marts identical to the candidate", len(published) - len(differ), len(published))
            if differ:
                problems.append(f"values differ: {differ}")
        db.commit()
        replaced = sum(1 for t, oid in db.table_oids().items() if oids.get(t) != oid)
    except psycopg.Error:
        problems.append("the lock's session was lost during the real build: raw may have changed under it")
    if problems:
        for p in problems:
            log.error("equivalence check failed: %s", p)
        return MISMATCH
    log.info(
        "published: %d marts replaced, raw unchanged under the lock (F0 = F1), row counts equal to the candidate, in %.0f s",
        replaced,
        time.monotonic() - started,
    )
    return PUBLISHED


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_dotenv()
    parser = argparse.ArgumentParser(prog="python -m pipeline publish", description=__doc__.splitlines()[0])
    parser.add_argument("--simulate-test-failure", action="store_true", help="fail the candidate on purpose; never on production")
    parser.add_argument("--compare", action="store_true", help="also compare every value of every mart with the candidate")
    parser.add_argument("--full-refresh", action="store_true", help="passed to both dbt builds")
    parser.add_argument("--target", choices=["production", "test", "local"], help="which database (default: local or production)")
    args = parser.parse_args(argv)
    target = args.target or ("local" if is_local_database() else "production")
    if args.simulate_test_failure and (target == "production" or (target == "local" and not is_local_database())):
        parser.error("--simulate-test-failure runs only against the local database or with --target test")

    with psycopg.connect(database_url()) as conn:
        return publish(PublishDb(conn), simulate_test_failure=args.simulate_test_failure, compare=args.compare, full_refresh=args.full_refresh)


if __name__ == "__main__":
    sys.exit(main())
