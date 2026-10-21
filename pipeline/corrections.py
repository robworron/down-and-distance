"""Corrections to values nflverse publishes wrongly in its schedules.

raw.schedules stays as published. The fixes live in one seed,
transform/seeds/schedule_corrections.csv (one row per game and column), which
dbt's stg_schedules applies in SQL and the weather loader applies here, so
both always agree. Fixed so far: kickoff times with 12-hour clock slips, and
international games filed under the home team's US stadium.
"""

from pathlib import Path

import pandas as pd

CORRECTIONS_CSV = Path("transform/seeds/schedule_corrections.csv")


def load_corrections() -> pd.DataFrame:
    """The corrections seed; a blank corrected_value means 'unknown' (NULL)."""
    return pd.read_csv(CORRECTIONS_CSV, dtype=str, keep_default_na=False)


def apply_schedule_corrections(games: pd.DataFrame, corrections: pd.DataFrame | None = None) -> pd.DataFrame:
    """A copy of games (keyed by game_id) with the corrected values swapped in.

    Only columns present in games are touched, so a loader that reads a few
    schedule columns gets just the fixes it needs.
    """
    corrections = load_corrections() if corrections is None else corrections
    games = games.copy()
    for c in corrections.itertuples():
        if c.column_name in games.columns:
            value = c.corrected_value if c.corrected_value != "" else None
            games.loc[games["game_id"] == c.game_id, c.column_name] = value
    return games
