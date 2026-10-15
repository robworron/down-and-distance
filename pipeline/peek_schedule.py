"""Print the first few games of a season's schedule from nflverse."""

import sys

import nflreadpy as nfl


def main() -> None:
    # Windows consoles default to cp1252, which can't draw Polars' table borders.
    sys.stdout.reconfigure(encoding="utf-8")

    schedule = nfl.load_schedules(seasons=[2025])
    print(f"{schedule.height} games, {schedule.width} columns")
    print(schedule.select("game_id", "game_type", "week", "gameday", "away_team", "home_team", "away_score", "home_score").head(5))


if __name__ == "__main__":
    main()
