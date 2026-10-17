"""Shared pytest fixtures: a database engine for the checks that read raw tables."""

import pandas as pd
import pytest
from sqlalchemy import Engine, text

from pipeline.db import get_engine


@pytest.fixture(scope="session")
def engine() -> Engine:
    return get_engine()


@pytest.fixture(scope="session")
def query(engine):
    """Run SQL and return a DataFrame."""

    def run(sql: str, **params) -> pd.DataFrame:
        with engine.connect() as conn:
            return pd.read_sql(text(sql), conn, params=params)

    return run
