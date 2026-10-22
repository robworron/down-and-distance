"""The pipeline's command line: one command loads every raw table.

    uv run python -m pipeline ingest                    # current season only (the nightly job)
    uv run python -m pipeline ingest --full             # everything, from each table's first season
    uv run python -m pipeline ingest --seasons 2020-2022
    uv run python -m pipeline ingest --only schedules,weather
    uv run python -m pipeline dbt build                 # any dbt command, against DATABASE_URL
    uv run python -m pipeline refresh --site URL        # tell the site the marts changed

Tables load in dependency order: schedules first (weather reads it), then
teams, weather and play-by-play. Every load is an idempotent upsert, so a
failed run is safe to rerun.
"""

import argparse
import logging
import sys
import time

from pipeline import load_pbp, load_schedule, load_teams, load_weather
from pipeline.seasons import current_season, parse_seasons

log = logging.getLogger("pipeline")

TABLES = ["schedules", "teams", "weather", "pbp"]


def ingest(seasons: list[int] | None, only: list[str]) -> None:
    """Load the chosen tables; seasons=None means each table's full history."""
    last = current_season()

    def span(first: int) -> list[int]:
        return list(range(first, last + 1)) if seasons is None else seasons

    loaders = {
        "schedules": lambda: load_schedule.load(span(load_schedule.FIRST_SEASON)),
        "teams": load_teams.load,
        "weather": lambda: load_weather.load(span(load_weather.FIRST_SEASON)),
        "pbp": lambda: load_pbp.load(span(load_pbp.FIRST_SEASON)),
    }
    for table in TABLES:
        if table in only:
            started = time.monotonic()
            log.info("loading %s", table)
            loaders[table]()
            log.info("%s done in %.0f s", table, time.monotonic() - started)


def main() -> None:
    # `dbt` passes everything after it straight to dbt, flags included.
    if sys.argv[1:2] == ["dbt"]:
        from pipeline.run_dbt import run

        sys.exit(run(sys.argv[2:]))
    # `refresh` has its own options (pipeline/refresh.py).
    if sys.argv[1:2] == ["refresh"]:
        from pipeline.refresh import main as refresh

        sys.exit(refresh(sys.argv[2:]))

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Down & Distance data pipeline.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("dbt", help="run a dbt command against DATABASE_URL, e.g. dbt build")
    commands.add_parser("refresh", help="refresh the site's cache after a dbt build, then check its pages")

    ingest_cmd = commands.add_parser("ingest", help="load the raw tables")
    which = ingest_cmd.add_mutually_exclusive_group()
    which.add_argument("--seasons", help="e.g. 2025 or 2016-2026; default: current season")
    which.add_argument("--full", action="store_true", help="every season each table covers")
    ingest_cmd.add_argument("--only", default=",".join(TABLES), help=f"comma-separated subset of {','.join(TABLES)}")

    args = parser.parse_args()
    only = [t.strip() for t in args.only.split(",")]
    unknown = sorted(set(only) - set(TABLES))
    if unknown:
        parser.error(f"unknown table(s) for --only: {', '.join(unknown)}")

    ingest(None if args.full else parse_seasons(args.seasons), only)


if __name__ == "__main__":
    main()
