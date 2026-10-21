"""Validate transform/seeds/stadiums.csv against the schedules and the map.

Checks, for every stadium:
  - its stadium_id is used by raw.schedules (or by a stadium_id correction in
    schedule_corrections.csv), and every schedules stadium_id is in the CSV;
  - its IANA time zone matches the zone timezonefinder derives from its coordinates;
  - it lies within 30 km of its municipality, geocoded by Open-Meteo.

--fill-altitude fetches each stadium's elevation from Open-Meteo and writes
altitude_m back to the CSV.

    uv run python -m pipeline.validate_stadiums [--fill-altitude]
"""

import argparse
import json
import math
import sys
import unicodedata
from pathlib import Path

import pandas as pd
import requests
from sqlalchemy import text
from timezonefinder import TimezoneFinder

from pipeline.corrections import load_corrections
from pipeline.db import get_engine

CSV_PATH = Path("transform/seeds/stadiums.csv")
CACHE_DIR = Path("pipeline/.cache/open-meteo/geocoding")
MAX_KM = 30


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points on Earth, in km."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def fold(name: str) -> str:
    """Lower-case and strip accents, so 'Île-de-France' matches 'Ile-de-France'."""
    return unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()


def geocode(city: str, region: str, country: str) -> dict | None:
    """The Open-Meteo geocoding result for city in region, cached to disk."""
    path = CACHE_DIR / f"{fold(city)}_{fold(region)}_{country}.json".replace(" ", "-")
    if path.exists():
        results = json.loads(path.read_text(encoding="utf-8"))
    else:
        response = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": city, "count": 20, "countryCode": country, "language": "en"},
            timeout=30,
        )
        response.raise_for_status()
        results = response.json().get("results", [])
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(results), encoding="utf-8")
    # Contains, not equals: the geocoder names some regions "Île-de-France Region".
    matches = [r for r in results if fold(region) in fold(r.get("admin1", ""))]
    return matches[0] if matches else None


def fill_altitude(stadiums: pd.DataFrame) -> None:
    """Write each stadium's elevation (m) from Open-Meteo into the CSV."""
    response = requests.get(
        "https://api.open-meteo.com/v1/elevation",
        params={
            "latitude": ",".join(map(str, stadiums["latitude"])),
            "longitude": ",".join(map(str, stadiums["longitude"])),
        },
        timeout=30,
    )
    response.raise_for_status()
    stadiums["altitude_m"] = [round(e) for e in response.json()["elevation"]]
    stadiums.to_csv(CSV_PATH, index=False, lineterminator="\n")
    print(f"altitude_m written for {len(stadiums)} stadiums")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fill-altitude", action="store_true")
    args = parser.parse_args()

    stadiums = pd.read_csv(CSV_PATH, keep_default_na=False, dtype={"altitude_m": "Int64"}, na_values={"altitude_m": [""]})
    if args.fill_altitude:
        fill_altitude(stadiums)

    problems: list[str] = []

    with get_engine().connect() as conn:
        used = set(conn.execute(text("SELECT DISTINCT stadium_id FROM raw.schedules")).scalars())
    # Venues only reached through a correction (e.g. Croke Park) count as used.
    corrections = load_corrections()
    used |= set(corrections.loc[corrections["column_name"] == "stadium_id", "corrected_value"])
    listed = set(stadiums["stadium_id"])
    problems += [f"{s}: in raw.schedules but missing from the CSV" for s in sorted(used - listed)]
    problems += [f"{s}: in the CSV but not used by raw.schedules or a correction" for s in sorted(listed - used)]
    if stadiums["stadium_id"].duplicated().any():
        problems.append("duplicate stadium_id in the CSV")

    finder = TimezoneFinder()
    for s in stadiums.itertuples():
        derived = finder.timezone_at(lat=s.latitude, lng=s.longitude)
        if derived != s.timezone:
            problems.append(f"{s.stadium_id}: timezone {s.timezone}, but its coordinates are in {derived}")

        place = geocode(s.city, s.region, s.country)
        if place is None:
            problems.append(f"{s.stadium_id}: could not geocode {s.city}, {s.region}, {s.country}")
            continue
        km = haversine_km(s.latitude, s.longitude, place["latitude"], place["longitude"])
        if km > MAX_KM:
            problems.append(f"{s.stadium_id}: {km:.0f} km from {s.city}, {s.region} (limit {MAX_KM})")
        print(f"{s.stadium_id:6} {s.timezone:31} {km:5.1f} km from {s.city}")

    if problems:
        print(f"\n{len(problems)} problem(s):")
        print("\n".join(f"  - {p}" for p in problems))
        sys.exit(1)
    print(f"\nAll {len(stadiums)} stadiums pass: ids match schedules, time zones match, all within {MAX_KM} km.")


if __name__ == "__main__":
    main()
