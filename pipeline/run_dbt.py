"""Run dbt against DATABASE_URL.

dbt's profile needs host, port, user and so on as separate values, while the
project keeps one connection string per database. This splits DATABASE_URL
into the DBT_* variables transform/profiles.yml reads, then runs dbt with
transform/ as both the project and the profiles directory.

    uv run python -m pipeline dbt debug
    uv run python -m pipeline dbt build
    uv run python -m pipeline dbt ls --resource-type source
"""

import os
from urllib.parse import parse_qs, unquote, urlsplit

from pipeline.db import database_url

PROJECT_DIR = "transform"


def dbt_env(url: str) -> dict[str, str]:
    """The DBT_* variables for a postgresql:// URL (password percent-decoded)."""
    parts = urlsplit(url)
    query = parse_qs(parts.query)
    return {
        "DBT_HOST": parts.hostname or "localhost",
        "DBT_PORT": str(parts.port or 5432),
        "DBT_USER": unquote(parts.username or ""),
        "DBT_PASSWORD": unquote(parts.password or ""),
        "DBT_DBNAME": parts.path.lstrip("/"),
        "DBT_SSLMODE": query.get("sslmode", ["prefer"])[0],
    }


def run(args: list[str]) -> int:
    """Run one dbt command; returns a process exit code."""
    # Imported here so `pipeline ingest` doesn't pay for loading dbt.
    from dbt.cli.main import dbtRunner

    os.environ.update(dbt_env(database_url()))
    os.environ.setdefault("DBT_PROJECT_DIR", PROJECT_DIR)
    os.environ.setdefault("DBT_PROFILES_DIR", PROJECT_DIR)
    result = dbtRunner().invoke(args)
    if result.exception is not None:
        return 2
    return 0 if result.success else 1
