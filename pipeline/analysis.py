"""Helpers for the Phase 3 notebooks: read the marts into pandas, and save charts.

The analysis rules (seasons, baselines, the keep rule) are in docs/decisions.md,
"Phase 3 analysis rules". The constants below are the season range they name.
"""

from pathlib import Path

import pandas as pd
from sqlalchemy import text

from pipeline.db import get_engine

ROOT = Path(__file__).resolve().parents[1]
FIGURES_DIR = ROOT / "docs" / "figures"

# Effect estimates use complete regular seasons only (2026 is in progress).
FIRST_SEASON = 1999
LAST_SEASON = 2025
# Play-by-play, and so EPA, starts in 2016.
EPA_FIRST_SEASON = 2016

# Chart colours: the dataviz skill's reference palette, light surface.
SURFACE = "#fcfcfb"
TEXT_PRIMARY = "#0b0b0b"
TEXT_SECONDARY = "#52514e"
GRID = "#e4e3df"
SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]


def mart_tables() -> set[str]:
    """Names of the tables in the marts schema."""
    query = text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'marts'")
    with get_engine().connect() as conn:
        return set(conn.execute(query).scalars())


def read_mart(name: str, where: str | None = None, params: dict | None = None) -> pd.DataFrame:
    """Read marts.<name> into pandas, optionally filtered.

    `name` must be a table in the marts schema, so it can't smuggle in SQL.
    `where` is a SQL condition with :named placeholders whose values come in
    `params`, e.g. read_mart("games", "season >= :first", {"first": 2016}).
    """
    if name not in mart_tables():
        raise ValueError(f"marts.{name} does not exist")
    sql = f'SELECT * FROM marts."{name}"'
    if where:
        sql += f" WHERE {where}"
    with get_engine().connect() as conn:
        return pd.read_sql(text(sql), conn, params=params or {})


def regular_season(df: pd.DataFrame, first: int = FIRST_SEASON, last: int = LAST_SEASON) -> pd.DataFrame:
    """Finished regular-season games in [first, last], from marts.games or marts.team_games."""
    is_regular = df["season_type"] == "REG" if "season_type" in df else ~df["is_playoff"]
    keep = is_regular & df["is_finished"] & df["season"].between(first, last)
    return df[keep].copy()


def chart_style() -> None:
    """Apply the project's matplotlib style: light surface, recessive grid, thin marks."""
    import matplotlib.pyplot as plt

    plt.rcParams.update(
        {
            "figure.facecolor": SURFACE,
            "axes.facecolor": SURFACE,
            "savefig.facecolor": SURFACE,
            "axes.edgecolor": GRID,
            "axes.labelcolor": TEXT_SECONDARY,
            "axes.titlecolor": TEXT_PRIMARY,
            "axes.titlesize": 13,
            "axes.titleweight": "bold",
            "axes.titlelocation": "left",
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "axes.grid.axis": "y",
            "axes.axisbelow": True,
            "grid.color": GRID,
            "grid.linewidth": 0.8,
            "xtick.color": TEXT_SECONDARY,
            "ytick.color": TEXT_SECONDARY,
            "text.color": TEXT_PRIMARY,
            "font.size": 10,
            "legend.frameon": False,
            "lines.linewidth": 2,
            "axes.prop_cycle": plt.cycler(color=SERIES),
        }
    )


def save_figure(fig, name: str) -> Path:
    """Save fig as docs/figures/<name>.png and return the path."""
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    path = FIGURES_DIR / f"{name}.png"
    fig.savefig(path, dpi=150, bbox_inches="tight")
    return path
