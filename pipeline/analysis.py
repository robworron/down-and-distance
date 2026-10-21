"""Helpers for the team situation analysis notebooks: read the marts into pandas, measure effects, and save charts.

The analysis rules (seasons, baselines, the keep rule) are in docs/decisions.md,
"Analysis rules, set before any effect is estimated" and its amendment. The constants below are the
season range and bootstrap settings they name.
"""

from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import hypergeom, norm
from sqlalchemy import text
from statsmodels.stats.multitest import multipletests

from pipeline.db import get_engine

ROOT = Path(__file__).resolve().parents[1]
FIGURES_DIR = ROOT / "docs" / "figures"

# Effect estimates use complete regular seasons only (2026 is in progress).
FIRST_SEASON = 1999
LAST_SEASON = 2025
# Play-by-play, and so EPA, starts in 2016.
EPA_FIRST_SEASON = 2016

# Bootstrap: resamples of whole games, with a fixed seed so every run gives the same intervals.
N_RESAMPLES = 2000
SEED = 2026

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


def win_score(result: pd.Series) -> pd.Series:
    """1 for a win, ½ for a tie, 0 for a loss, so its mean is win % = (wins + ½ ties) / games."""
    return result.map({"win": 1.0, "tie": 0.5, "loss": 0.0})


def leave_one_out_strength(team_games: pd.DataFrame, column: str) -> tuple[pd.Series, pd.Series]:
    """Each row's team and opponent strength: the mean of `column` over that team's *other* games in
    the same season, leaving this game out. Needs both rows of every game.
    """
    by_team_season = team_games.groupby(["team", "season"])[column]
    team = (by_team_season.transform("sum") - team_games[column]) / (by_team_season.transform("size") - 1)
    # The two rows of a game hold both teams' strengths; the opponent's is the game's sum minus this row's.
    opponent = team.groupby(team_games["game_id"]).transform("sum") - team
    return team, opponent


def resample_weights(n_games: int, n_resamples: int = N_RESAMPLES, seed: int = SEED) -> np.ndarray:
    """Bootstrap weights for n_games games: row 0 is the actual data, rows 1.. are resamples.

    A resample draws n_games games at random, with replacement, from the n_games we have, so some
    games appear twice and some not at all. Entry [b, g] counts how often game g is in resample b,
    so weighting each game's numbers by a row recomputes any statistic on that resample.
    """
    rng = np.random.default_rng(seed)
    resamples = rng.multinomial(n_games, np.full(n_games, 1 / n_games), size=n_resamples)
    return np.vstack([np.ones(n_games), resamples]).astype(float)


def stratum_means(weights: np.ndarray, values: np.ndarray, mask: np.ndarray, strata: np.ndarray) -> np.ndarray:
    """The mean of `values` over the games in `mask`, per stratum, in every row of `weights`.

    `strata` is a (games × strata) 0/1 array saying which stratum (e.g. season) each game is in.
    Returns a (rows × strata) array; a stratum with no games gets 0.
    """
    if not np.isfinite(values[mask]).all():
        raise ValueError("a baseline game has no value")
    totals = weights @ (strata * np.where(mask, values, 0.0)[:, None])
    counts = weights @ (strata * mask[:, None])
    return np.divide(totals, counts, out=np.zeros_like(totals), where=counts > 0)


def bucket_mean(
    weights: np.ndarray,
    values: np.ndarray,
    in_bucket: np.ndarray,
    sign: np.ndarray | None = None,
    baseline: np.ndarray | None = None,
    strata: np.ndarray | None = None,
) -> np.ndarray:
    """The mean over the bucket's games of (value − sign × its stratum's baseline), in every row of `weights`.

    Without a baseline it's a plain mean. With one, `baseline` is stratum_means' output, and `sign` says
    how each game's value relates to its stratum mean:
    - +1: the same side (a home team, or a whole game);
    - −1: the mirror side (an away team: the away mean is minus the home mean);
    - 0: no baseline (a neutral site, where the mean is 0 by symmetry).
    """
    games = np.flatnonzero(in_bucket)
    if not np.isfinite(values[games]).all():
        raise ValueError("a game in the bucket has no value")
    w = weights[:, games]
    result = w @ values[games]
    if baseline is not None:
        exposure = w @ (strata[games] * sign[games, None])  # bucket games per stratum, signed
        result = result - (baseline * exposure).sum(axis=1)
    return result / w.sum(axis=1)


def summarize(rows: np.ndarray) -> dict:
    """The estimate (row 0), bootstrap standard error, 95% CI and two-sided p-value from bucket_mean's output."""
    estimate, resampled = rows[0], rows[1:]
    se = resampled.std(ddof=1)
    return {
        "estimate": estimate,
        "se": se,
        "ci_low": estimate - 1.96 * se,
        "ci_high": estimate + 1.96 * se,
        "p": 2 * norm.sf(abs(estimate) / se),
    }


def fisher_p_table(n_games: int, n_wins: int) -> np.ndarray:
    """Two-sided Fisher's exact p-values for every possible split of a team's games.

    The team won n_wins of n_games. Entry [n, w] is the p-value for winning w of the n games in a bucket:
    if the bucket were a random draw of n of the team's games, the hypergeometric chance of a win count
    at least as unlikely as w. Entries with w > n are unused.
    """
    table = np.ones((n_games + 1, n_games + 1))
    for n in range(n_games + 1):
        pmf = hypergeom.pmf(np.arange(n + 1), n_games, n_wins, n)
        # Sum the chances of every outcome no more likely than the observed one (small tolerance for ties).
        as_unlikely = pmf[None, :] <= pmf[:, None] * (1 + 1e-7)
        table[n, : n + 1] = np.minimum((as_unlikely * pmf[None, :]).sum(axis=1), 1.0)
    return table


def bh_adjust(pvalues) -> np.ndarray:
    """Benjamini–Hochberg adjusted p-values: a test is a discovery at false-discovery rate q when its adjusted p ≤ q."""
    return multipletests(np.asarray(pvalues, dtype=float), method="fdr_bh")[1]


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
