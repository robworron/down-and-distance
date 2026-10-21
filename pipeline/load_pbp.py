"""Load nflverse play-by-play into raw.pbp, one season at a time.

Keeps the 60 columns chosen in notebooks/01_pbp_columns.ipynb (step 0.17).
Upserts on (game_id, play_id); plays that disappear from a loaded season are
deleted.

nflverse publishes most numeric columns as decimals (float64) even when they
only ever hold whole numbers: 0/1 flags, down, yards, play_id. Those are
stored as smallint/integer instead, which keeps the same values in about 60%
of the space. A value that isn't whole, or doesn't fit, stops the load.

    uv run python -m pipeline.load_pbp --seasons 2016-2026
"""

import argparse
import logging

import nflreadpy as nfl
import pandas as pd

from pipeline.db import UpsertResult, get_connection, nflverse_to_pandas, upsert_dataframe
from pipeline.seasons import parse_seasons

log = logging.getLogger(__name__)

FIRST_SEASON = 2016

# The reason for each group is in notebooks/01_pbp_columns.ipynb.
PBP_COLUMNS = [
    # keys and context
    "game_id", "play_id", "season", "week", "season_type", "posteam", "defteam", "posteam_type",
    # game state
    "qtr", "down", "ydstogo", "yardline_100", "goal_to_go", "game_seconds_remaining", "score_differential",
    # drives
    "fixed_drive", "fixed_drive_result",
    # play type and filters
    "play_type", "pass", "rush", "qb_dropback", "qb_scramble", "qb_kneel", "qb_spike", "aborted_play",
    "two_point_attempt",
    # play value
    "epa", "success", "yards_gained", "first_down",
    # win probability
    "wp", "wpa",
    # passing
    "pass_attempt", "complete_pass", "air_yards", "cpoe", "pass_oe",
    # rushing
    "rush_attempt",
    # turnovers and sacks
    "interception", "fumble", "fumble_lost", "sack",
    # scoring
    "touchdown", "pass_touchdown", "rush_touchdown", "return_touchdown", "td_team", "safety",
    # third and fourth down
    "third_down_converted", "third_down_failed", "fourth_down_converted", "fourth_down_failed",
    # penalties
    "penalty", "penalty_team", "penalty_yards",
    # kicking
    "field_goal_attempt", "field_goal_result", "extra_point_result", "punt_attempt",
    # text
    "desc",
]

# Decimal at the source, whole numbers in practice: stored as integers.
# play_id gets 4 bytes for headroom; everything else fits 2 (up to 32,767).
INTEGER_COLUMNS = {"play_id": "Int32"} | {
    c: "Int16"
    for c in [
        "qtr", "down", "ydstogo", "yardline_100", "goal_to_go", "game_seconds_remaining", "score_differential",
        "fixed_drive", "pass", "rush", "qb_dropback", "qb_scramble", "qb_kneel", "qb_spike", "aborted_play",
        "two_point_attempt", "success", "yards_gained", "first_down", "pass_attempt", "complete_pass",
        "air_yards", "rush_attempt", "interception", "fumble", "fumble_lost", "sack", "touchdown",
        "pass_touchdown", "rush_touchdown", "return_touchdown", "safety", "third_down_converted",
        "third_down_failed", "fourth_down_converted", "fourth_down_failed", "penalty", "penalty_yards",
        "field_goal_attempt", "punt_attempt",
    ]
}


def compact(pbp: pd.DataFrame) -> pd.DataFrame:
    """Keep PBP_COLUMNS and store the whole-number decimal columns as integers.

    pandas refuses to cast a value that isn't whole or doesn't fit the
    integer type; the error is re-raised naming the column.
    """
    pbp = pbp[PBP_COLUMNS].copy()
    for column, dtype in INTEGER_COLUMNS.items():
        try:
            pbp[column] = pbp[column].astype(dtype)
        except TypeError as error:
            raise ValueError(f"raw.pbp column {column!r} has a value that won't fit {dtype}: {error}") from error
    return pbp


def create_indexes() -> None:
    """Index for per-team queries. game_id lookups use the primary key.

    The primary key (game_id, play_id) is a B-tree sorted by game_id first,
    so it already finds every play of a game; a separate game_id index would
    duplicate it.
    """
    with get_connection() as conn:
        conn.execute("CREATE INDEX IF NOT EXISTS pbp_season_posteam_idx ON raw.pbp (season, posteam)")


def load(seasons: list[int]) -> list[UpsertResult]:
    results = []
    for season in [s for s in seasons if s >= FIRST_SEASON]:
        pbp = compact(nflverse_to_pandas(nfl.load_pbp(seasons=[season])))
        if pbp.empty:
            # A season that has started but has no plays published yet: skip it
            # rather than let the upsert treat it as "every play was deleted".
            log.warning("raw.pbp: no plays published for %s yet; skipped", season)
            continue
        results.append(upsert_dataframe(pbp, "pbp", ["game_id", "play_id"], scope_col="season", scope_values=[season]))
    if results:
        create_indexes()
    return results


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seasons", help="e.g. 2025 or 2016-2026; default: current season")
    load(parse_seasons(parser.parse_args().seasons))


if __name__ == "__main__":
    main()
