"""Unit tests for the loaders' pure logic: no database or network needed."""

import pandas as pd
import pytest

from pipeline.corrections import apply_schedule_corrections, load_corrections
from pipeline.load_pbp import INTEGER_COLUMNS, PBP_COLUMNS, compact
from pipeline.load_weather import game_weather, kickoff_hour, kickoff_utc
from pipeline.run_dbt import dbt_env
from pipeline.seasons import parse_seasons


def test_parse_seasons():
    assert parse_seasons("2025") == [2025]
    assert parse_seasons("1999-2001") == [1999, 2000, 2001]
    assert parse_seasons("2016,2018-2019") == [2016, 2018, 2019]


def test_kickoff_utc_follows_daylight_saving():
    # 2017: clocks went back on Sunday 5 November.
    utc = kickoff_utc(pd.Series(["2017-10-29", "2017-11-05"]), pd.Series(["13:00", "13:00"]))
    assert [t.strftime("%H:%M") for t in utc] == ["17:00", "18:00"]


def test_kickoff_hour_rounds_half_hours_up():
    # 9:30 ET London games: 13:30 UTC in October, 14:30 UTC in November.
    # pandas' .dt.round would give 14:00 for both (round half to even).
    t = pd.Series(pd.to_datetime(["2017-10-01 13:30", "2017-11-19 14:30", "2017-10-01 20:25", "2017-12-31 23:30"]))
    hours = kickoff_hour(t.dt.tz_localize("UTC"))
    assert [h.strftime("%m-%d %H:%M") for h in hours] == ["10-01 14:00", "11-19 15:00", "10-01 20:00", "01-01 00:00"]


def hourly(temps, precip):
    times = pd.date_range("2020-01-01 00:00", periods=len(temps), freq="h").strftime("%Y-%m-%dT%H:%M").tolist()
    n = len(temps)
    return {
        "hourly": {
            "time": times,
            "temperature_2m": temps,
            "precipitation": precip,
            "snowfall": [0.0] * n,
            "wind_speed_10m": [float(i) for i in range(n)],
            "wind_gusts_10m": [None] * n,
        }
    }


def one_game(kickoff: str) -> pd.DataFrame:
    k = pd.Series(pd.to_datetime([kickoff])).dt.tz_localize("UTC")
    return pd.DataFrame({"game_id": ["g"], "season": [2019], "kickoff_utc": k, "kickoff_hour": k, "latitude": [0.0], "longitude": [0.0]})


def test_game_window_values():
    data = hourly([10, 11, 12, 13, 14, 15], [0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
    w = game_weather(one_game("2020-01-01 01:00"), data).iloc[0]
    assert w["temperature_f"] == 11 and w["precipitation_in"] == pytest.approx(0.2)
    assert w["temperature_avg_f"] == pytest.approx((11 + 12 + 13 + 14) / 4)  # hours k..k+3
    assert w["precipitation_total_in"] == pytest.approx(0.3 + 0.4 + 0.5)  # hours k+1..k+3
    assert w["wind_max_mph"] == 4  # hour k+3
    assert pd.isna(w["wind_gust_mph"]) and pd.isna(w["wind_gust_max_mph"])  # all-null column


def test_game_window_needs_every_hour():
    data = hourly([10, 11, None, 13, 14, 15], [0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
    w = game_weather(one_game("2020-01-01 00:00"), data).iloc[0]
    assert pd.isna(w["temperature_avg_f"])  # hour 2 missing
    assert w["precipitation_total_in"] == pytest.approx(0.2 + 0.3 + 0.4)
    late = game_weather(one_game("2020-01-01 04:00"), data).iloc[0]  # window runs past the data
    assert late["temperature_f"] == 14 and pd.isna(late["temperature_avg_f"]) and pd.isna(late["precipitation_total_in"])


def pbp_frame(**overrides) -> pd.DataFrame:
    row = {c: 0.0 for c in PBP_COLUMNS} | {c: "x" for c in PBP_COLUMNS if c not in INTEGER_COLUMNS and c not in {"epa", "wp", "wpa", "cpoe", "pass_oe"}}
    row |= {"play_id": 1.0, "season": 2025, "week": 1} | overrides
    return pd.DataFrame([row])


def test_compact_stores_whole_numbers_as_integers():
    df = compact(pbp_frame(yards_gained=-7.0, down=None))
    assert str(df["play_id"].dtype) == "Int32" and str(df["yards_gained"].dtype) == "Int16"
    assert df.loc[0, "yards_gained"] == -7 and pd.isna(df.loc[0, "down"])


@pytest.mark.parametrize("bad", [{"yards_gained": 2.5}, {"game_seconds_remaining": 40000.0}])
def test_compact_refuses_values_that_would_change(bad):
    with pytest.raises(ValueError, match=next(iter(bad))):
        compact(pbp_frame(**bad))


def test_dbt_env_splits_the_url():
    env = dbt_env("postgresql://owner:p%40ss%2Fw0rd@ep-x.neon.tech/neondb?sslmode=require&channel_binding=require")
    assert env == {
        "DBT_HOST": "ep-x.neon.tech",
        "DBT_PORT": "5432",
        "DBT_USER": "owner",
        "DBT_PASSWORD": "p@ss/w0rd",
        "DBT_DBNAME": "neondb",
        "DBT_SSLMODE": "require",
    }


def test_dbt_env_defaults():
    env = dbt_env("postgresql://u:pw@localhost:15432/dnd")
    assert (env["DBT_PORT"], env["DBT_SSLMODE"]) == ("15432", "prefer")


def test_schedule_corrections_swap_in_values():
    games = pd.DataFrame({"game_id": ["a", "b"], "gametime": ["09:00", "13:00"], "stadium_id": ["PIT00", "BUF00"]})
    fixes = pd.DataFrame(
        {
            "game_id": ["a", "a", "b"],
            "column_name": ["gametime", "stadium_id", "roof"],  # roof isn't in games: ignored
            "nflverse_value": ["09:00", "PIT00", "dome"],
            "corrected_value": ["21:00", "DUB00", ""],
            "note": ["", "", ""],
        }
    )
    fixed = apply_schedule_corrections(games, fixes)
    assert fixed.to_dict("list") == {"game_id": ["a", "b"], "gametime": ["21:00", "13:00"], "stadium_id": ["DUB00", "BUF00"]}
    assert games.loc[0, "gametime"] == "09:00", "the input must not be changed"


def test_schedule_corrections_seed_is_well_formed():
    seed = load_corrections()
    assert not seed.duplicated(["game_id", "column_name"]).any()
    assert set(seed["column_name"]) <= {"gametime", "stadium_id", "roof"}
