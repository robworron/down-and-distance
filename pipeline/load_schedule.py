"""Load nflverse schedules into raw.schedules.

Upserts on game_id, so rerunning is safe; games that disappear from a loaded
season (e.g. a cancelled game) are deleted.

    uv run python -m pipeline.load_schedule --seasons 1999-2026
"""

import argparse
import logging

import nflreadpy as nfl

from pipeline.db import UpsertResult, nflverse_to_pandas, upsert_dataframe
from pipeline.seasons import parse_seasons

FIRST_SEASON = 1999


def load(seasons: list[int]) -> UpsertResult:
    schedule = nflverse_to_pandas(nfl.load_schedules(seasons=seasons))
    return upsert_dataframe(schedule, "schedules", ["game_id"], scope_col="season", scope_values=seasons)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seasons", help="e.g. 2025 or 1999-2026; default: current season")
    load(parse_seasons(parser.parse_args().seasons))


if __name__ == "__main__":
    main()
