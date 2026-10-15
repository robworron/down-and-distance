"""Load one season of the nflverse schedule into raw.schedules.

For now the table is replaced on every run; upserts arrive in step 1.2.
"""

import nflreadpy as nfl
from sqlalchemy import text

from pipeline.db import get_engine

SEASON = 2025


def main() -> None:
    schedule = nfl.load_schedules(seasons=[SEASON])
    engine = get_engine()

    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS raw"))

    schedule.write_database("raw.schedules", connection=engine, if_table_exists="replace")

    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM raw.schedules")).scalar_one()
    print(f"raw.schedules now has {count} rows")


if __name__ == "__main__":
    main()
