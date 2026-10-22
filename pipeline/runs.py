"""Run records: raw.pipeline_runs (one row per ingest run) and raw.source_loads
(one row per table each run loaded). The nightly job and marts.data_freshness
read them.

Each write opens its own short autocommit connection, so a record survives
whatever happens to the load it describes, and a long quiet spell (a slow
weather fetch while Neon suspends its idle compute) can't leave a stale
connection behind. Never written inside `pipeline publish`, whose lock on
raw would make the write wait on itself.
"""

import re
import uuid
from datetime import datetime
from importlib.metadata import version
from pathlib import Path

import psycopg
from psycopg import sql

from pipeline.db import UpsertResult, database_url

RUN_RECORDS_SQL = Path(__file__).parent / "sql" / "run_records.sql"
STALE_AFTER = "3 hours"  # a run still 'running' this long after it started has died
ERROR_LIMIT = 500

# Anything that could carry a credential: URLs (connection strings, request
# URLs) and key=value pairs naming a password, token or secret.
_URL = re.compile(r"\b[a-z][a-z0-9+.-]*://\S+", re.IGNORECASE)
_SECRET_PAIR = re.compile(r"\b(password|passwd|pwd|token|secret|authorization)\b(\s*[=:]\s*)\S+", re.IGNORECASE)


def sanitize_error(error: BaseException) -> str:
    """The exception's type and message with URLs and secrets removed, capped in length."""
    text = f"{type(error).__name__}: {error}"
    text = _URL.sub("<url>", text)
    text = _SECRET_PAIR.sub(lambda m: f"{m.group(1)}{m.group(2)}<removed>", text)
    return text if len(text) <= ERROR_LIMIT else text[: ERROR_LIMIT - 1] + "…"


def nflreadpy_version() -> str | None:
    try:
        return version("nflreadpy")
    except Exception:  # noqa: BLE001 (a missing version is recorded as NULL, never fatal)
        return None


class RunLog:
    """Writes one run's records. `schema` is "raw" except in tests."""

    def __init__(self, url: str | None = None, schema: str = "raw"):
        self.schema = schema
        self.url = url or database_url()

    def _execute(self, query, params=None) -> None:
        with psycopg.connect(self.url, autocommit=True) as conn:
            conn.execute(query, params)

    def _table(self, name: str) -> sql.Identifier:
        return sql.Identifier(self.schema, name)

    def ensure_tables(self) -> None:
        """Create the two tables if they don't exist (run_records.sql)."""
        text = RUN_RECORDS_SQL.read_text(encoding="utf-8")
        if self.schema != "raw":
            text = text.replace("raw.", f"{self.schema}.").replace("SCHEMA IF NOT EXISTS raw", f"SCHEMA IF NOT EXISTS {self.schema}")
        self._execute(text)

    def start_run(self, trigger: str, target: str, git_sha: str | None) -> uuid.UUID:
        """Mark runs left 'running' for 3 hours as abandoned, then open this one."""
        self._execute(
            sql.SQL(
                "UPDATE {t} SET status = 'abandoned', finished_at = now() "
                "WHERE status = 'running' AND started_at < now() - %s::interval"
            ).format(t=self._table("pipeline_runs")),
            [STALE_AFTER],
        )
        run_id = uuid.uuid4()
        self._execute(
            sql.SQL("INSERT INTO {t} (run_id, trigger, target, git_sha) VALUES (%s, %s, %s, %s)").format(t=self._table("pipeline_runs")),
            [run_id, trigger, target, git_sha],
        )
        return run_id

    def record_load(
        self,
        run_id: uuid.UUID,
        table_name: str,
        seasons: list[int] | None,
        started: datetime,
        finished: datetime,
        result: UpsertResult | None,
        error: BaseException | None,
    ) -> None:
        counts = (result.inserted, result.updated, result.unchanged, result.deleted) if result else (None,) * 4
        self._execute(
            sql.SQL(
                "INSERT INTO {t} (run_id, table_name, seasons, status, rows_inserted, rows_updated, rows_unchanged, "
                "rows_deleted, error, nflreadpy_version, started_at, finished_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
            ).format(t=self._table("source_loads")),
            [
                run_id,
                table_name,
                seasons,
                "failed" if error else "success",
                *counts,
                sanitize_error(error) if error else None,
                nflreadpy_version(),
                started,
                finished,
            ],
        )

    def finish_run(self, run_id: uuid.UUID, status: str) -> None:
        self._execute(
            sql.SQL("UPDATE {t} SET status = %s, finished_at = now() WHERE run_id = %s").format(t=self._table("pipeline_runs")),
            [status, run_id],
        )

    def close(self) -> None:
        """Nothing to close: every write used its own connection."""
