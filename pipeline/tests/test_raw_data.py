"""Data checks on the raw layer, run against DATABASE_URL (local or Neon).

    uv run pytest pipeline/tests/test_raw_data.py
"""

import re
from pathlib import Path

import pandas as pd
import pytest
from timezonefinder import TimezoneFinder

from pipeline.corrections import load_corrections
from pipeline.seasons import current_season

CHECKS = Path("pipeline/sql/checks")
STADIUMS = pd.read_csv("transform/seeds/stadiums.csv")


def expected_regular_season_games(season: int) -> int:
    if season <= 2001:
        return 248  # 31 teams
    if season <= 2020:
        return 256  # 32 teams, 16 games
    if season == 2022:
        return 271  # Bills-Bengals, Week 17, cancelled
    return 272  # 17 games from 2021


def test_regular_season_games_per_season(query):
    counts = query((CHECKS / "games_per_season.sql").read_text()).set_index("season")["games"]
    assert list(counts.index) == list(range(1999, current_season() + 1)), "a season is missing"
    wrong = {s: n for s, n in counts.items() if n != expected_regular_season_games(s)}
    assert not wrong, f"unexpected game counts: {wrong}"


def test_every_team_code_resolves(query):
    unmatched = query((CHECKS / "unmatched_team_codes.sql").read_text())
    assert unmatched.empty, f"team codes with no team: {unmatched['team_code'].tolist()}"


@pytest.mark.parametrize(
    "table, key",
    [
        ("raw.schedules", "game_id"),
        ("raw.teams", "team_abbr"),
        ("raw.game_weather", "game_id"),
        ("raw.pbp", "game_id, play_id"),
    ],
)
def test_no_duplicate_keys(query, table, key):
    dupes = query(f"SELECT {key}, count(*) AS n FROM {table} GROUP BY {key} HAVING count(*) > 1")
    assert dupes.empty, f"{len(dupes)} duplicate keys in {table}"


def test_home_away_margin_2025(query):
    """Long format: 32 teams, each once at home and once away (step 2.1)."""
    rows = query((CHECKS / "home_away_margin_2025.sql").read_text())
    assert len(rows) == 64, f"{len(rows)} rows"
    assert (rows.groupby("team")["venue"].apply(sorted).apply(tuple) == ("away", "home")).all()


def test_weather_coverage(query):
    """Over 99% of finished games played in the open, from 2000, have weather.

    "In the open": the game's roof is outdoors/open, or the stadium has no roof
    (stadiums.csv). The rule lives in weather_coverage.sql.
    """
    result = query((CHECKS / "weather_coverage.sql").read_text()).iloc[0]
    assert result["coverage_pct"] > 99, f"weather for {result['with_weather']} of {result['games']} games"


def test_open_air_list_matches_seed():
    """weather_coverage.sql types in stadiums.csv's roofless stadiums; they must match."""
    in_sql = set(re.findall(r"\('([A-Z]{3}\d{2})'\)", (CHECKS / "weather_coverage.sql").read_text()))
    in_seed = set(STADIUMS.loc[STADIUMS["roof"] == "outdoors", "stadium_id"])
    assert in_sql == in_seed, f"only in the SQL: {sorted(in_sql - in_seed)}; only in the CSV: {sorted(in_seed - in_sql)}"


def test_mislabelled_open_air_game_has_weather(query):
    """nflverse lists the 2026 Melbourne Cricket Ground game as 'dome'; the MCG has no roof."""
    row = query(
        """
        SELECT s.roof, w.temperature_f
        FROM raw.schedules AS s LEFT JOIN raw.game_weather AS w USING (game_id)
        WHERE s.game_id = '2026_01_SF_LA'
        """
    )
    assert len(row) == 1 and row.iloc[0]["roof"] == "dome", "nflverse's label changed; revisit this test"
    assert pd.notna(row.iloc[0]["temperature_f"]), "the MCG game has no weather"


def test_schedule_corrections_still_needed(query):
    """Each correction must still match what nflverse publishes.

    If nflverse fixes a value upstream (or changes it to something else), the
    correction is stale: review it in transform/seeds/schedule_corrections.csv.
    """
    seed = load_corrections()
    raw = query("SELECT game_id, gametime, stadium_id, coalesce(roof, '') AS roof FROM raw.schedules").set_index("game_id")
    stale = [
        (c.game_id, c.column_name, c.nflverse_value, raw.at[c.game_id, c.column_name] if c.game_id in raw.index else "missing")
        for c in seed.itertuples()
        if c.game_id not in raw.index or raw.at[c.game_id, c.column_name] != c.nflverse_value
    ]
    assert not stale, f"(game, column, expected, now in raw): {stale}"


def test_snow_game_has_snow(query):
    snow = query("SELECT snowfall_in, snowfall_total_in FROM raw.game_weather WHERE game_id = '2017_14_IND_BUF'")
    assert len(snow) == 1 and snow.iloc[0]["snowfall_in"] > 0 and snow.iloc[0]["snowfall_total_in"] > 0


def test_no_orphan_pbp_games(query):
    orphans = query("SELECT DISTINCT p.game_id FROM raw.pbp AS p LEFT JOIN raw.schedules AS s USING (game_id) WHERE s.game_id IS NULL")
    assert orphans.empty, f"play-by-play for games not in schedules: {orphans['game_id'].tolist()[:10]}"


def test_finished_games_have_pbp(query):
    """Every finished game since 2016, older than 3 days, has play-by-play."""
    missing = query(
        """
        SELECT s.game_id
        FROM raw.schedules AS s
        WHERE s.season >= 2016
          AND s.home_score IS NOT NULL
          AND s.gameday::date <= current_date - 3
          AND NOT EXISTS (SELECT 1 FROM raw.pbp AS p WHERE p.game_id = s.game_id)
        """
    )
    assert missing.empty, f"finished games without play-by-play: {missing['game_id'].tolist()[:10]}"


def test_every_stadium_in_seed(query):
    used = set(query("SELECT DISTINCT stadium_id FROM raw.schedules")["stadium_id"])
    missing = used - set(STADIUMS["stadium_id"])
    assert not missing, f"stadium_ids missing from stadiums.csv: {sorted(missing)}"


def test_stadium_timezones_match_coordinates():
    finder = TimezoneFinder()
    wrong = [
        (s.stadium_id, s.timezone, finder.timezone_at(lat=s.latitude, lng=s.longitude))
        for s in STADIUMS.itertuples()
        if finder.timezone_at(lat=s.latitude, lng=s.longitude) != s.timezone
    ]
    assert not wrong, f"(stadium, csv zone, zone at coordinates): {wrong}"
