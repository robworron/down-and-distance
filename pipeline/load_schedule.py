"""Load one season of the nflverse schedule into raw.schedules.

For now the table is replaced on every run; upserts arrive in step 1.2.
"""

import nflreadpy as nfl
from sqlalchemy import text

from pipeline.db import get_engine

SEASON = 2025


def main() -> None:
    # nflreadpy returns Polars; convert to pandas straight away.
    schedule = nfl.load_schedules(seasons=[SEASON]).to_pandas()
    engine = get_engine()

    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS raw"))

    schedule.to_sql("schedules", engine, schema="raw", if_exists="replace", index=False)

    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM raw.schedules")).scalar_one()
    print(f"raw.schedules now has {count} rows")


if __name__ == "__main__":
    main()
