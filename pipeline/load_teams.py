"""Load nflverse team data into raw.teams.

One row per team code, including old codes for relocated teams (OAK, SD, STL).
Upserts on team_abbr; there are no seasons, so nothing is ever deleted.

    uv run python -m pipeline.load_teams
"""

import logging

import nflreadpy as nfl

from pipeline.db import UpsertResult, nflverse_to_pandas, upsert_dataframe


def load() -> UpsertResult:
    teams = nflverse_to_pandas(nfl.load_teams())
    return upsert_dataframe(teams, "teams", ["team_abbr"])


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load()


if __name__ == "__main__":
    main()
