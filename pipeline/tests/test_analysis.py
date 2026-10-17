"""Unit tests for the Phase 3 analysis helpers. No database needed."""

import pandas as pd
import pytest

from pipeline import analysis


def test_regular_season_keeps_finished_regular_games_in_range():
    # marts.games marks playoffs with is_playoff.
    games = pd.DataFrame(
        {
            "season": [1998, 1999, 2025, 2025, 2025, 2026],
            "is_playoff": [False, False, False, True, False, False],
            "is_finished": [True, True, True, True, False, True],
        }
    )
    assert analysis.regular_season(games).index.tolist() == [1, 2]


def test_regular_season_reads_season_type_on_team_games():
    # marts.team_games marks them with season_type instead.
    team_games = pd.DataFrame(
        {
            "season": [2016, 2016, 2017],
            "season_type": ["REG", "POST", "REG"],
            "is_finished": [True, True, True],
        }
    )
    assert analysis.regular_season(team_games, first=2016, last=2016).index.tolist() == [0]


def test_read_mart_refuses_unknown_tables(monkeypatch):
    monkeypatch.setattr(analysis, "mart_tables", lambda: {"games"})
    with pytest.raises(ValueError, match="does not exist"):
        analysis.read_mart('games"; DROP TABLE marts.games; --')
