"""Unit tests for the team situation analysis helpers. No database needed."""

import numpy as np
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


def test_win_score_counts_a_tie_as_half():
    assert analysis.win_score(pd.Series(["win", "tie", "loss"])).tolist() == [1.0, 0.5, 0.0]


def test_leave_one_out_strength_leaves_the_game_out():
    # Three teams, one season: A beat B by 10, A beat C by 4, B beat C by 6.
    team_games = pd.DataFrame(
        {
            "game_id": ["g1", "g1", "g2", "g2", "g3", "g3"],
            "season": [2020] * 6,
            "team": ["A", "B", "A", "C", "B", "C"],
            "margin": [10.0, -10.0, 4.0, -4.0, 6.0, -6.0],
        }
    )
    team, opponent = analysis.leave_one_out_strength(team_games, "margin")
    # In g1, A's other game is +4 and B's other game is +6.
    assert team.tolist() == [4.0, 6.0, 10.0, -6.0, -10.0, -4.0]
    assert opponent.tolist() == [6.0, 4.0, -6.0, 10.0, -4.0, -10.0]


def test_resample_weights_start_with_the_data_and_keep_the_game_count():
    weights = analysis.resample_weights(50, n_resamples=20, seed=1)
    assert weights.shape == (21, 50)
    assert (weights[0] == 1).all()
    assert (weights.sum(axis=1) == 50).all()


def test_bucket_mean_subtracts_the_venue_baseline_with_its_sign():
    # One season, four games. Home margins 3, 1, -2 and 6: the home mean is 2, so the away mean is -2.
    weights = np.ones((1, 4))
    strata = np.ones((4, 1))
    baseline = analysis.stratum_means(weights, np.array([3.0, 1.0, -2.0, 6.0]), np.ones(4, bool), strata)
    # The bucket: the away side of games 0 and 2 (margins -3 and 2), each against the away mean of -2.
    values = np.array([-3.0, np.nan, 2.0, np.nan])
    in_bucket = np.array([True, False, True, False])
    sign = np.array([-1.0, 0.0, -1.0, 0.0])
    result = analysis.bucket_mean(weights, values, in_bucket, sign, baseline, strata)
    assert result[0] == pytest.approx(((-3 + 2) + (2 + 2)) / 2)


def test_bootstrap_se_matches_the_formula_for_a_plain_mean():
    values = np.random.default_rng(0).normal(0, 14, size=400)
    rows = analysis.bucket_mean(analysis.resample_weights(400, seed=3), values, np.ones(400, bool))
    assert analysis.summarize(rows)["se"] == pytest.approx(values.std(ddof=1) / np.sqrt(400), rel=0.1)


def test_bh_adjust_textbook_example():
    # Sorted p-values .005 .01 .03 .04 of m = 4; each times m / rank gives .02 .02 .04 .04.
    assert analysis.bh_adjust([0.01, 0.04, 0.03, 0.005]) == pytest.approx([0.02, 0.04, 0.04, 0.02])


def test_fisher_p_table_matches_scipy():
    from scipy.stats import fisher_exact

    for n_games, n_wins in [(51, 15), (51, 32), (10, 5)]:
        table = analysis.fisher_p_table(n_games, n_wins)
        for n in range(n_games + 1):
            for w in range(max(0, n_wins - (n_games - n)), min(n, n_wins) + 1):  # feasible win counts only
                expected = fisher_exact([[w, n - w], [n_wins - w, n_games - n - (n_wins - w)]]).pvalue
                assert table[n, w] == pytest.approx(expected, abs=1e-9), (n_games, n_wins, n, w)


def test_fisher_p_table_two_wins_in_two_games():
    # A team that won 15 of 51: both of 2 random games are wins with chance 15/51 × 14/50.
    assert analysis.fisher_p_table(51, 15)[2, 2] == pytest.approx(15 / 51 * 14 / 50)
