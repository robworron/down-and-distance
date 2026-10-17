"""Database connection and loading helpers shared by the pipeline scripts."""

import logging
import os
from dataclasses import dataclass
from urllib.parse import urlsplit

import pandas as pd
import psycopg
import pyarrow as pa
from dotenv import load_dotenv
from psycopg import sql
from sqlalchemy import Engine, create_engine

log = logging.getLogger(__name__)


def database_url() -> str:
    """DATABASE_URL from .env, as a plain postgresql:// URL."""
    load_dotenv()
    url = os.environ["DATABASE_URL"]
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def is_local_database() -> bool:
    """True when DATABASE_URL points at the local Docker Postgres, not Neon."""
    return urlsplit(database_url()).hostname in {"localhost", "127.0.0.1", "::1"}


def get_engine() -> Engine:
    """Build a SQLAlchemy engine from DATABASE_URL in .env (used for pandas reads)."""
    # SQLAlchemy needs the driver named in the URL; Neon and Vercel use plain postgresql://.
    return create_engine(database_url().replace("postgresql://", "postgresql+psycopg://", 1))


def get_connection() -> psycopg.Connection:
    """Open a psycopg connection to DATABASE_URL (used for loads)."""
    return psycopg.connect(database_url())


def nflverse_to_pandas(frame) -> pd.DataFrame:
    """Convert nflreadpy's Polars output to pandas, keeping integer columns as integers.

    A plain .to_pandas() turns an integer column with nulls into float64
    (scores would become 24.0). Mapping every Arrow integer type to pandas'
    nullable Int64 keeps them whole.
    """
    return frame.to_pandas(types_mapper=lambda t: pd.Int64Dtype() if pa.types.is_integer(t) else None)


def pg_type(dtype) -> str:
    """The Postgres column type for a pandas dtype."""
    if pd.api.types.is_bool_dtype(dtype):
        return "boolean"
    if pd.api.types.is_integer_dtype(dtype):
        # Int16 -> smallint (2 bytes), Int32 -> integer (4), Int64 -> bigint (8).
        return {1: "smallint", 2: "smallint", 4: "integer"}.get(dtype.itemsize, "bigint")
    if pd.api.types.is_float_dtype(dtype):
        return "double precision"
    if isinstance(dtype, pd.DatetimeTZDtype):
        return "timestamptz"
    if pd.api.types.is_datetime64_dtype(dtype):
        return "timestamp"
    return "text"


@dataclass
class UpsertResult:
    inserted: int
    updated: int
    unchanged: int
    deleted: int

    def __str__(self) -> str:
        return (
            f"{self.inserted} inserted, {self.updated} updated, "
            f"{self.unchanged} unchanged, {self.deleted} deleted"
        )


def upsert_dataframe(
    df: pd.DataFrame,
    table: str,
    key_cols: list[str],
    scope_col: str | None = None,
    scope_values: list | None = None,
    schema: str = "raw",
) -> UpsertResult:
    """Upsert df into schema.table on key_cols, in one transaction.

    New keys are inserted; existing rows are updated only when a value differs.
    With scope_col (e.g. "season") and scope_values (the seasons being loaded),
    rows in those seasons whose key is no longer in df are deleted. A requested
    season with no incoming rows raises instead of being wiped.
    """
    if scope_col:
        empty = [v for v in scope_values if not (df[scope_col] == v).any()]
        if empty:
            raise ValueError(f"No incoming rows for {scope_col} {empty}; refusing to delete them")

    target = sql.Identifier(schema, table)
    cols = list(df.columns)
    col_ids = sql.SQL(", ").join(map(sql.Identifier, cols))
    key_ids = sql.SQL(", ").join(map(sql.Identifier, key_cols))
    non_key = [c for c in cols if c not in key_cols]
    key_match = sql.SQL(" AND ").join(
        sql.SQL("s.{c} = t.{c}").format(c=sql.Identifier(c)) for c in key_cols
    )

    with get_connection() as conn:
        conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema)))

        # 1. Create the table on first load, typed from the dataframe.
        conn.execute(
            sql.SQL("CREATE TABLE IF NOT EXISTS {t} ({defs}, _loaded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ({keys}))").format(
                t=target,
                defs=sql.SQL(", ").join(
                    sql.SQL("{} {}").format(sql.Identifier(c), sql.SQL(pg_type(df[c].dtype))) for c in cols
                ),
                keys=key_ids,
            )
        )

        # 2. Add any column the source has gained since the table was created.
        existing = {
            r[0]
            for r in conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema = %s AND table_name = %s",
                (schema, table),
            )
        }
        for c in cols:
            if c not in existing:
                log.warning("%s.%s: adding new column %s", schema, table, c)
                conn.execute(
                    sql.SQL("ALTER TABLE {t} ADD COLUMN {c} {ty}").format(
                        t=target, c=sql.Identifier(c), ty=sql.SQL(pg_type(df[c].dtype))
                    )
                )

        # 3. Copy the dataframe into a temporary staging table with the same columns.
        conn.execute(
            sql.SQL("CREATE TEMP TABLE stage ON COMMIT DROP AS SELECT {cols} FROM {t} WITH NO DATA").format(
                cols=col_ids, t=target
            )
        )
        rows = df.astype(object).where(df.notna(), None).itertuples(index=False, name=None)
        with conn.cursor().copy(sql.SQL("COPY stage ({}) FROM STDIN").format(col_ids)) as copy:
            for row in rows:
                copy.write_row(row)

        # 4. Upsert: insert new keys; update existing rows only if a value changed.
        inserted = conn.execute(
            sql.SQL("SELECT count(*) FROM stage s WHERE NOT EXISTS (SELECT 1 FROM {t} t WHERE {m})").format(
                t=target, m=key_match
            )
        ).fetchone()[0]
        affected = conn.execute(
            sql.SQL(
                "INSERT INTO {t} AS t ({cols}) SELECT {cols} FROM stage "
                "ON CONFLICT ({keys}) DO UPDATE SET {sets}, _loaded_at = now() "
                "WHERE ({old}) IS DISTINCT FROM ({new})"
            ).format(
                t=target,
                cols=col_ids,
                keys=key_ids,
                sets=sql.SQL(", ").join(sql.SQL("{c} = EXCLUDED.{c}").format(c=sql.Identifier(c)) for c in non_key),
                old=sql.SQL(", ").join(sql.SQL("t.{}").format(sql.Identifier(c)) for c in non_key),
                new=sql.SQL(", ").join(sql.SQL("EXCLUDED.{}").format(sql.Identifier(c)) for c in non_key),
            )
        ).rowcount

        # 5. Delete rows in the loaded seasons that the source no longer has.
        deleted = 0
        if scope_col:
            deleted = conn.execute(
                sql.SQL("DELETE FROM {t} t WHERE t.{sc} = ANY(%s) AND NOT EXISTS (SELECT 1 FROM stage s WHERE {m})").format(
                    t=target, sc=sql.Identifier(scope_col), m=key_match
                ),
                (list(scope_values),),
            ).rowcount

    result = UpsertResult(inserted, affected - inserted, len(df) - affected, deleted)
    log.info("%s.%s: %s", schema, table, result)
    return result
