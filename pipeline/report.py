"""Read-only reports for the nightly job's log (step 1.6).

    uv run python -m pipeline.report oids   # each mart table's identity (marts_table_oids.sql)
    uv run python -m pipeline.report runs   # what the latest run did (latest_run_loads.sql)

The nightly job prints both, so a run's log shows whether the marts were
replaced or left untouched, and what was recorded, on whichever database
DATABASE_URL points at. The session is read-only, and nothing printed
contains connection details.
"""

import sys
from pathlib import Path

import psycopg

from pipeline.db import database_url

CHECKS = Path(__file__).parent / "sql" / "checks"


def rows(sql_file: str) -> tuple[list[str], list[tuple]]:
    with psycopg.connect(database_url(), autocommit=True) as conn:
        conn.execute("SET default_transaction_read_only = on")
        cur = conn.execute((CHECKS / sql_file).read_text(encoding="utf-8"))
        return [d.name for d in cur.description], cur.fetchall()


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv not in (["oids"], ["runs"]):
        print(__doc__)
        return 2
    if argv == ["oids"]:
        _, found = rows("marts_table_oids.sql")
        print(f"marts: {len(found)} tables")
        for name, oid, approx in found:
            print(f"  {name:<20} oid {oid:<8} ~{approx if approx is not None else '?'} rows")
    else:
        names, found = rows("latest_run_loads.sql")
        if not found:
            print("no run records yet")
        for r in found:
            rec = dict(zip(names, r, strict=True))
            counts = "" if rec["rows_inserted"] is None else f" +{rec['rows_inserted']} ~{rec['rows_updated']} ={rec['rows_unchanged']} -{rec['rows_deleted']}"
            error = f"  error: {rec['error']}" if rec["error"] else ""
            print(f"  run {str(rec['run_id'])[:8]} {rec['trigger']}/{rec['target']} {rec['run_status']}: {rec['table_name']} {rec['load_status']}{counts}{error}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
