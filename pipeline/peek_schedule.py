"""Print the first few games of a season's schedule from nflverse."""

import nflreadpy as nfl


def main() -> None:
    # nflreadpy returns Polars; convert to pandas straight away.
    schedule = nfl.load_schedules(seasons=[2025]).to_pandas()
    print(f"{len(schedule)} games, {len(schedule.columns)} columns")
    columns = ["game_id", "game_type", "week", "gameday", "away_team", "home_team", "away_score", "home_score"]
    print(schedule[columns].head(5).to_string(index=False))


if __name__ == "__main__":
    main()
