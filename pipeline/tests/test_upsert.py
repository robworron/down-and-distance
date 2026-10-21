"""Unit tests for upsert_dataframe, on a throwaway schema in the local database.

Marked local_only: they create and drop tables, so they skip themselves unless
DATABASE_URL points at the local Docker Postgres.
"""

import uuid

import pandas as pd
import pytest
from sqlalchemy import text

from pipeline.db import is_local_database, upsert_dataframe

pytestmark = [
    pytest.mark.local_only,
    pytest.mark.skipif(not is_local_database(), reason="writes tables; local database only"),
]


@pytest.fixture
def schema(engine):
    """A fresh schema for one test, dropped afterwards."""
    name = f"test_upsert_{uuid.uuid4().hex[:8]}"
    yield name
    with engine.begin() as conn:
        conn.execute(text(f"DROP SCHEMA IF EXISTS {name} CASCADE"))


def games(rows) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["game_id", "season", "score"])
    return df.astype({"season": "Int64", "score": "Int16"})


BASE = [("a", 2020, 10), ("b", 2020, 20), ("c", 2021, 30)]


def load(df, schema, seasons):
    return upsert_dataframe(df, "games", ["game_id"], scope_col="season", scope_values=seasons, schema=schema)


def table(engine, schema) -> dict:
    with engine.connect() as conn:
        rows = conn.execute(text(f"SELECT game_id, score FROM {schema}.games ORDER BY game_id")).all()
    return dict(rows)


def counts(result) -> tuple:
    return (result.inserted, result.updated, result.unchanged, result.deleted)


def test_insert_then_rerun_changes_nothing(engine, schema):
    assert counts(load(games(BASE), schema, [2020, 2021])) == (3, 0, 0, 0)
    assert counts(load(games(BASE), schema, [2020, 2021])) == (0, 0, 3, 0)
    assert table(engine, schema) == {"a": 10, "b": 20, "c": 30}


def test_changed_row_is_updated(engine, schema):
    load(games(BASE), schema, [2020, 2021])
    changed = [("a", 2020, 11), ("b", 2020, 20), ("c", 2021, 30)]
    assert counts(load(games(changed), schema, [2020, 2021])) == (0, 1, 2, 0)
    assert table(engine, schema)["a"] == 11


def test_value_to_null_and_back_is_detected(engine, schema):
    """IS DISTINCT FROM treats NULL as a value; plain <> would miss these."""
    load(games(BASE), schema, [2020, 2021])
    to_null = [("a", 2020, None), ("b", 2020, 20), ("c", 2021, 30)]
    assert counts(load(games(to_null), schema, [2020, 2021])) == (0, 1, 2, 0)
    assert counts(load(games(to_null), schema, [2020, 2021])) == (0, 0, 3, 0)
    assert counts(load(games(BASE), schema, [2020, 2021])) == (0, 1, 2, 0)


def test_stale_row_deleted_only_in_loaded_season(engine, schema):
    load(games(BASE), schema, [2020, 2021])
    # Reload 2020 without "b": b is deleted; c (2021) is untouched.
    assert counts(load(games([("a", 2020, 10)]), schema, [2020])) == (0, 0, 1, 1)
    assert table(engine, schema) == {"a": 10, "c": 30}


def test_empty_season_is_refused_and_nothing_changes(engine, schema):
    load(games(BASE), schema, [2020, 2021])
    with pytest.raises(ValueError, match="refusing"):
        load(games([("a", 2020, 10)]), schema, [2020, 2021])  # no 2021 rows at all
    assert table(engine, schema) == {"a": 10, "b": 20, "c": 30}


def test_new_source_column_is_added(engine, schema):
    load(games(BASE), schema, [2020, 2021])
    wider = games(BASE).assign(venue="home")
    assert counts(load(wider, schema, [2020, 2021])) == (0, 3, 0, 0)  # NULL -> 'home'
    with engine.connect() as conn:
        venue = conn.execute(text(f"SELECT DISTINCT venue FROM {schema}.games")).scalars().all()
    assert venue == ["home"]


def test_column_types_follow_pandas(engine, schema):
    load(games(BASE), schema, [2020, 2021])
    with engine.connect() as conn:
        types = dict(
            conn.execute(
                text("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = :s"),
                {"s": schema},
            ).all()
        )
    assert types == {"game_id": "text", "season": "bigint", "score": "smallint", "_loaded_at": "timestamp with time zone"}
