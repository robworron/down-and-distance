"""The pipeline's command line: one command loads every raw table.

    uv run python -m pipeline ingest                    # current season only (the nightly job)
    uv run python -m pipeline ingest --full             # everything, from each table's first season
    uv run python -m pipeline ingest --seasons 2020-2022
    uv run python -m pipeline ingest --only schedules,weather
    uv run python -m pipeline publish                   # gate, candidate build, then dbt build (pipeline/publish.py)
    uv run python -m pipeline dbt build                 # any dbt command, against DATABASE_URL
    uv run python -m pipeline refresh --site URL        # tell the site the marts changed

Tables load in dependency order: schedules first (weather reads it), then
teams, weather and play-by-play. Each loads on its own: a failure is recorded
in raw.source_loads and the others still run. Every load is an idempotent
upsert, so a failed run is safe to rerun.

Exit codes for ingest: 0 every table loaded; 1 an optional table (teams,
weather, pbp) failed; 2 schedules failed, or the run records couldn't be
written. The nightly job skips publishing on 2.
"""

import argparse
import logging
import os
import subprocess
import sys
import time
from collections.abc import Callable
from datetime import UTC, datetime

from pipeline import load_pbp, load_schedule, load_teams, load_weather
from pipeline.db import UpsertResult, is_local_database
from pipeline.seasons import current_season, parse_seasons

log = logging.getLogger("pipeline")

TABLES = ["schedules", "teams", "weather", "pbp"]
RAW_TABLE = {"schedules": "schedules", "teams": "teams", "weather": "game_weather", "pbp": "pbp"}
# Without schedules there's nothing new to publish: every mart is built from it.
REQUIRED = {"schedules"}
EXIT_OK, EXIT_OPTIONAL_FAILED, EXIT_REQUIRED_FAILED = 0, 1, 2

# A loader: the seasons it loads (None for teams) and the call that loads them.
Loader = tuple[list[int] | None, Callable[[], object]]


class SimulatedFailure(Exception):
    """Raised instead of loading a table, for --simulate-failure."""


def default_loaders(seasons: list[int] | None) -> dict[str, Loader]:
    """The real loaders; seasons=None means each table's full history."""
    last = current_season()

    def span(first: int) -> list[int]:
        return list(range(first, last + 1)) if seasons is None else seasons

    return {
        "schedules": (span(load_schedule.FIRST_SEASON), lambda: load_schedule.load(span(load_schedule.FIRST_SEASON))),
        "teams": (None, load_teams.load),
        "weather": (span(load_weather.FIRST_SEASON), lambda: load_weather.load(span(load_weather.FIRST_SEASON))),
        "pbp": (span(load_pbp.FIRST_SEASON), lambda: load_pbp.load(span(load_pbp.FIRST_SEASON))),
    }


def combine(result: object) -> UpsertResult | None:
    """One UpsertResult from what a loader returns (pbp returns one per season)."""
    if isinstance(result, list):
        if not result:
            return None
        return UpsertResult(*(sum(getattr(r, f) for r in result) for f in ("inserted", "updated", "unchanged", "deleted")))
    return result if isinstance(result, UpsertResult) else None


def git_sha() -> str | None:
    if sha := os.environ.get("GITHUB_SHA"):
        return sha
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def ingest(
    only: list[str],
    loaders: dict[str, Loader],
    runs,
    trigger: str,
    target: str,
    simulate_failure: str | None = None,
) -> int:
    """Load each chosen table on its own, recording every outcome; returns an exit code."""
    run_id = runs.start_run(trigger, target, git_sha())
    failed: list[str] = []
    for table in TABLES:
        if table not in only:
            continue
        seasons, load = loaders[table]
        log.info("loading %s", table)
        started = datetime.now(UTC)
        result, error = None, None
        try:
            if table == simulate_failure:
                raise SimulatedFailure(f"simulated failure of {table} (--simulate-failure)")
            result = combine(load())
        except Exception as e:  # noqa: BLE001 (any loader failure is recorded, and the other tables still load)
            error = e
            # A partial load (weather after a rate limit) still reports what it upserted.
            result = combine(getattr(e, "result", None))
            failed.append(table)
            log.error("%s failed: %s: %s", table, type(e).__name__, e)
        finished = datetime.now(UTC)
        runs.record_load(run_id, RAW_TABLE[table], seasons, started, finished, result, error)
        log.info("%s %s in %.0f s", table, "failed" if error else "done", (finished - started).total_seconds())

    required_failed = REQUIRED & set(failed)
    status = "failed" if required_failed else "partial" if failed else "success"
    runs.finish_run(run_id, status)
    log.info("run %s: %s%s", run_id, status, f" ({', '.join(failed)} failed)" if failed else "")
    if required_failed:
        return EXIT_REQUIRED_FAILED
    return EXIT_OPTIONAL_FAILED if failed else EXIT_OK


def main() -> None:
    # `dbt` passes everything after it straight to dbt, flags included.
    if sys.argv[1:2] == ["dbt"]:
        from pipeline.run_dbt import run

        sys.exit(run(sys.argv[2:]))
    # `refresh` and `publish` have their own options.
    if sys.argv[1:2] == ["refresh"]:
        from pipeline.refresh import main as refresh

        sys.exit(refresh(sys.argv[2:]))
    if sys.argv[1:2] == ["publish"]:
        from pipeline.publish import main as publish

        sys.exit(publish(sys.argv[2:]))

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Down & Distance data pipeline.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("dbt", help="run a dbt command against DATABASE_URL, e.g. dbt build")
    commands.add_parser("refresh", help="refresh the site's cache after a dbt build, then check its pages")
    commands.add_parser("publish", help="raw gate, candidate build, then the real dbt build, under a lock on raw")

    ingest_cmd = commands.add_parser("ingest", help="load the raw tables")
    which = ingest_cmd.add_mutually_exclusive_group()
    which.add_argument("--seasons", help="e.g. 2025 or 2016-2026; default: current season")
    which.add_argument("--full", action="store_true", help="every season each table covers")
    ingest_cmd.add_argument("--only", default=",".join(TABLES), help=f"comma-separated subset of {','.join(TABLES)}")
    ingest_cmd.add_argument("--trigger", default="local", help="what started the run (the workflow passes its event name)")
    ingest_cmd.add_argument("--target", choices=["production", "test", "local"], help="which database (default: local or production, from DATABASE_URL)")
    ingest_cmd.add_argument("--simulate-failure", choices=TABLES, help="fail this table on purpose; never on production")

    args = parser.parse_args()
    only = [t.strip() for t in args.only.split(",")]
    unknown = sorted(set(only) - set(TABLES))
    if unknown:
        parser.error(f"unknown table(s) for --only: {', '.join(unknown)}")
    local = is_local_database()
    target = args.target or ("local" if local else "production")
    # Fault injection only where it can't hurt: the local database or the test branch.
    if args.simulate_failure and (target == "production" or (target == "local" and not local)):
        parser.error("--simulate-failure runs only against the local database or with --target test")

    from pipeline.runs import RunLog

    try:
        runs = RunLog()
        runs.ensure_tables()
    except Exception as e:  # noqa: BLE001 (without run records the run can't be trusted: stop, exit 2)
        from pipeline.runs import sanitize_error

        log.error("can't write run records: %s", sanitize_error(e))
        sys.exit(EXIT_REQUIRED_FAILED)

    started = time.monotonic()
    code = ingest(only, default_loaders(None if args.full else parse_seasons(args.seasons)), runs, args.trigger, target, args.simulate_failure)
    runs.close()
    log.info("ingest finished in %.0f s, exit %d", time.monotonic() - started, code)
    sys.exit(code)


if __name__ == "__main__":
    main()
