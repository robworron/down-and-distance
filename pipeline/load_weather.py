"""Load game weather from Open-Meteo's historical archive into raw.game_weather.

For each finished game outside a fixed dome, from 2000 on (1999 has no kickoff
times), stores the weather at the kickoff hour and over the game window
(kickoff to kickoff + 3 hours).

Requests are batched: one per stadium per season, covering that season's
first to last game there. Responses are cached as JSON in
pipeline/.cache/open-meteo/archive/, named {stadium}_{season}_{start}_{end}.json.
A finished season's file never changes; for the season in progress, a later
run asks for a longer range (a new end date, so a new file) and picks up the
newer games.

    uv run python -m pipeline.load_weather --seasons 2000-2026
"""

import argparse
import json
import logging
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

from pipeline.corrections import apply_schedule_corrections
from pipeline.db import UpsertResult, get_engine, upsert_dataframe
from pipeline.seasons import parse_seasons

log = logging.getLogger(__name__)

FIRST_SEASON = 2000  # 1999 has no kickoff times in nflverse
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
CACHE_DIR = Path("pipeline/.cache/open-meteo/archive")
STADIUMS_CSV = Path("transform/seeds/stadiums.csv")
HOURLY = ["temperature_2m", "precipitation", "snowfall", "wind_speed_10m", "wind_gusts_10m"]
# The archive lags real time by a few days; only ask for days safely behind it.
ARCHIVE_LAG_DAYS = 7
# Open-Meteo's free tier allows 5,000 calls an hour, and a request spanning
# more than 14 days counts as one call per 14 days. Pacing each request by
# its weight keeps us near 4,000 an hour.
SECONDS_PER_CALL = 0.9


class RateLimited(Exception):
    """Open-Meteo answered 429: stop now, the cache lets a rerun resume."""


class WeatherIncomplete(Exception):
    """A rate limit left seasons unloaded. The finished ones were upserted
    first; `result` holds their counts, so the run records keep them."""

    def __init__(self, missing: list[int], result: UpsertResult | None):
        super().__init__(f"Open-Meteo rate limit: no weather loaded for season(s) {missing}; rerun later to resume")
        self.missing = missing
        self.result = result


def kickoff_utc(gameday: pd.Series, gametime: pd.Series) -> pd.Series:
    """nflverse kickoffs are US Eastern local time; convert them to UTC.

    The IANA zone handles daylight saving time: 1:00 pm ET is 17:00 UTC in
    September but 18:00 UTC in December.
    """
    local = pd.to_datetime(gameday + " " + gametime, format="%Y-%m-%d %H:%M")
    return local.dt.tz_localize("America/New_York").dt.tz_convert("UTC")


def kickoff_hour(kickoff: pd.Series) -> pd.Series:
    """Round each kickoff to the nearest hour, with half-hours always rounding up.

    pandas' .dt.round("h") rounds exact half-hours to the nearest *even* hour,
    so a 9:30 am ET London game would round up in October (13:30 -> 14:00 UTC)
    but down in November (14:30 -> 14:00 UTC).
    """
    return (kickoff + pd.Timedelta(minutes=30)).dt.floor("h")


def eligible_games(seasons: list[int]) -> pd.DataFrame:
    """Finished, timed games outside fixed domes, with coordinates and kickoff hour."""
    games = pd.read_sql(
        "SELECT game_id, season, gameday, gametime, stadium_id FROM raw.schedules "
        "WHERE season = ANY(%(seasons)s) AND gametime IS NOT NULL AND home_score IS NOT NULL",
        get_engine(),
        params={"seasons": [s for s in seasons if s >= FIRST_SEASON]},
    )
    # Fix nflverse's known wrong kickoff times and venues (schedule_corrections.csv)
    # before they decide which hours and which coordinates to fetch.
    games = apply_schedule_corrections(games)
    stadiums = pd.read_csv(STADIUMS_CSV)
    games = games.merge(stadiums[["stadium_id", "latitude", "longitude", "roof"]], on="stadium_id")
    games = games[games["roof"] != "dome"].drop(columns="roof")

    games["kickoff_utc"] = kickoff_utc(games["gameday"], games["gametime"])
    games["kickoff_hour"] = kickoff_hour(games["kickoff_utc"])
    # The game window can run past midnight UTC, so the day after kickoff must
    # also be safely inside the archive.
    last_safe_day = date.today() - timedelta(days=ARCHIVE_LAG_DAYS)
    games = games[games["kickoff_hour"].dt.date + timedelta(days=1) <= last_safe_day]
    return games


def fetch(stadium_id: str, season: int, lat: float, lon: float, start: date, end: date) -> dict:
    """Hourly weather for one stadium over [start, end], from the cache or the API."""
    path = CACHE_DIR / f"{stadium_id}_{season}_{start}_{end}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    response = requests.get(
        ARCHIVE_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "hourly": ",".join(HOURLY),
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "GMT",
        },
        timeout=60,
    )
    if response.status_code == 429:
        raise RateLimited(response.text)
    response.raise_for_status()
    data = response.json()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    # A season in progress leaves older, shorter responses behind; drop them.
    for old in CACHE_DIR.glob(f"{stadium_id}_{season}_*.json"):
        old.unlink()
    path.write_text(json.dumps(data), encoding="utf-8")

    days = (end - start).days + 1
    time.sleep(SECONDS_PER_CALL * -(-days // 14))  # ceil(days / 14) calls
    return data


def game_weather(games: pd.DataFrame, data: dict) -> pd.DataFrame:
    """Kickoff-hour and game-window values for the games at one stadium-season.

    Open-Meteo's hourly precipitation and snowfall are totals for the
    *preceding* hour, so the hours after kickoff k are summed over k+1..k+3.
    Temperature and wind are instantaneous, so they use hours k..k+3.
    A window value is null unless every hour it needs has data.
    """
    hourly = pd.DataFrame(data["hourly"])
    hourly.index = pd.to_datetime(hourly.pop("time")).dt.tz_localize("UTC")
    # JSON nulls arrive as None; float64 makes them NaN even if a column is all null.
    hourly = hourly[HOURLY].astype("float64")

    rows = []
    for g in games.itertuples():
        k = g.kickoff_hour
        window = hourly.reindex(pd.date_range(k, periods=4, freq="h"))  # k..k+3
        after = window.iloc[1:]  # k+1..k+3
        rows.append(
            {
                "game_id": g.game_id,
                "season": g.season,
                "kickoff_utc": g.kickoff_utc,
                "latitude": g.latitude,
                "longitude": g.longitude,
                "temperature_f": window["temperature_2m"].iloc[0],
                "precipitation_in": window["precipitation"].iloc[0],
                "snowfall_in": window["snowfall"].iloc[0],
                "wind_mph": window["wind_speed_10m"].iloc[0],
                "wind_gust_mph": window["wind_gusts_10m"].iloc[0],
                # skipna=False: one missing hour makes the whole value null,
                # rather than a sum, max or mean over fewer hours.
                "precipitation_total_in": after["precipitation"].sum(skipna=False),
                "snowfall_total_in": after["snowfall"].sum(skipna=False),
                "wind_max_mph": window["wind_speed_10m"].max(skipna=False),
                "wind_gust_max_mph": window["wind_gusts_10m"].max(skipna=False),
                "temperature_avg_f": window["temperature_2m"].mean(skipna=False),
            }
        )
    return pd.DataFrame(rows)


def load(seasons: list[int]) -> UpsertResult | None:
    """Fetch and upsert weather for the seasons' finished open-air games.

    A rate limit stops the fetching; the seasons already fetched are still
    upserted, then WeatherIncomplete is raised, so the run reports a failure
    rather than a quiet partial load.
    """
    games = eligible_games(seasons)
    frames, done_seasons = [], []
    rate_limited = False

    try:
        for season, season_games in games.groupby("season"):
            for stadium_id, g in season_games.groupby("stadium_id"):
                start = g["kickoff_hour"].min().date()
                end = g["kickoff_hour"].max().date() + timedelta(days=1)
                data = fetch(stadium_id, season, g["latitude"].iloc[0], g["longitude"].iloc[0], start, end)
                frames.append(game_weather(g, data))
            done_seasons.append(int(season))
            log.info("weather fetched for %s (%d games)", season, len(season_games))
    except RateLimited:
        rate_limited = True
        log.warning("Open-Meteo rate limit hit; loading the %d finished season(s). Rerun later to resume.", len(done_seasons))
    missing = sorted({int(s) for s in games["season"].unique()} - set(done_seasons))

    if not done_seasons:
        if rate_limited:
            raise WeatherIncomplete(missing, None)
        log.warning("no complete seasons of weather to load")
        return None

    weather = pd.concat(frames, ignore_index=True)
    weather = weather[weather["season"].isin(done_seasons)]
    # A missing kickoff-hour reading means the archive wasn't ready: leave the
    # game out so a later run fills it in.
    weather = weather[weather["temperature_f"].notna()]
    result = upsert_dataframe(weather, "game_weather", ["game_id"], scope_col="season", scope_values=done_seasons)
    if rate_limited:
        raise WeatherIncomplete(missing, result)
    return result


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seasons", help="e.g. 2017 or 2000-2026; default: current season")
    load(parse_seasons(parser.parse_args().seasons))


if __name__ == "__main__":
    main()
