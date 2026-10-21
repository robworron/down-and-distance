"""Create or update the read-only web_reader role in Neon, or check what it can do.

    uv run python -m pipeline.create_web_reader                               # grants + a new password
    uv run python -m pipeline.create_web_reader --keep-password               # grants only
    uv run python -m pipeline.create_web_reader --grant-only --keep-password  # expand: add marts, keep raw
    uv run python -m pipeline.create_web_reader --check                       # report only, change nothing

The grants run as the owner (NEON_DATABASE_URL) from two files in sql/:
web_reader.sql gives read access to marts, and web_reader_revoke_raw.sql
removes the raw access the role had until step 0.40. A plain run applies both.
--grant-only applies the first alone, so a change can go expand -> deploy ->
contract without the live site ever losing what it reads.

Without --keep-password the role also gets a fresh random password and
WEB_READER_DATABASE_URL (pooled host, for Vercel) is rewritten in .env, so
Vercel's DATABASE_URL must be updated afterwards. Secrets are never printed.
"""

import argparse
import secrets
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import psycopg
from dotenv import dotenv_values, set_key
from psycopg import errors, sql

ENV_PATH = Path(".env")
SQL_DIR = Path(__file__).parent / "sql"
GRANT_SQL = SQL_DIR / "web_reader.sql"
REVOKE_RAW_SQL = SQL_DIR / "web_reader_revoke_raw.sql"


def pooled_url(owner_url: str, user: str, password: str) -> str:
    """Swap in web_reader's login and Neon's pooler host (endpoint id + '-pooler')."""
    parts = urlsplit(owner_url)
    host = parts.hostname or ""
    endpoint, _, rest = host.partition(".")
    if not endpoint.endswith("-pooler"):
        endpoint += "-pooler"
    port = f":{parts.port}" if parts.port else ""
    netloc = f"{user}:{quote(password, safe='')}@{endpoint}.{rest}{port}"
    return urlunsplit(parts._replace(netloc=netloc))


def apply(owner_url: str, grant_only: bool, keep_password: bool) -> None:
    """Run the grant files as the owner and, unless keep_password, rotate the password."""
    files = [GRANT_SQL] if grant_only else [GRANT_SQL, REVOKE_RAW_SQL]
    password = None if keep_password else secrets.token_urlsafe(32)

    with psycopg.connect(owner_url, autocommit=True) as conn:
        for path in files:
            conn.execute(path.read_text())
            print(f"applied {path.name}")
        if password is not None:
            conn.execute(sql.SQL("ALTER ROLE web_reader PASSWORD {}").format(sql.Literal(password)))

    if password is not None:
        set_key(ENV_PATH, "WEB_READER_DATABASE_URL", pooled_url(owner_url, "web_reader", password), quote_mode="never")
        print("new password set; WEB_READER_DATABASE_URL saved to .env (update Vercel's DATABASE_URL)")


def check(reader_url: str) -> bool:
    """Connect as web_reader and print what it can read and write.

    Returns False if it can't read every marts table, can read staging, or can
    write anything. Still reading raw isn't a failure: that's the expected
    state between --grant-only and the full apply, and is reported as such.
    """
    readable: dict[str, list[int]] = {"marts": [0, 0], "raw": [0, 0], "staging": [0, 0]}

    with psycopg.connect(reader_url, autocommit=True) as conn:
        # pg_class lists every table and view, including those the role can't use.
        relations = conn.execute(
            """SELECT n.nspname, c.relname
               FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
               WHERE n.nspname = ANY(%s) AND c.relkind IN ('r', 'v', 'p')""",
            [list(readable)],
        ).fetchall()
        for schema, table in relations:
            readable[schema][1] += 1
            try:
                conn.execute(sql.SQL("SELECT 1 FROM {}.{} LIMIT 1").format(sql.Identifier(schema), sql.Identifier(table)))
                readable[schema][0] += 1
            except errors.InsufficientPrivilege:
                pass

        read_only = conn.execute("SHOW default_transaction_read_only").fetchone()[0] == "on"

        # The write attempt runs in a transaction that always rolls back, so even
        # if it were allowed nothing would be kept.
        try:
            with conn.transaction(force_rollback=True):
                conn.execute("INSERT INTO marts.situations (key) VALUES ('__web_reader_check__')")
            write = "ALLOWED"
        except (errors.ReadOnlySqlTransaction, errors.InsufficientPrivilege) as refused:
            write = f"refused ({type(refused).__name__})"

    marts_ok = readable["marts"][1] > 0 and readable["marts"][0] == readable["marts"][1]
    lines = [
        ("marts", f"{readable['marts'][0]} of {readable['marts'][1]} tables readable", marts_ok),
        ("staging", f"{readable['staging'][0]} of {readable['staging'][1]} tables readable", readable["staging"][0] == 0),
        ("raw", f"{readable['raw'][0]} of {readable['raw'][1]} tables readable", readable["raw"][0] == 0),
        ("write", write, write != "ALLOWED"),
        ("sessions", "read-only by default" if read_only else "NOT read-only by default", read_only),
    ]
    raw_left = readable["raw"][0] > 0
    failed = [name for name, _, good in lines if not good and name != "raw"]
    print("web_reader, connected with WEB_READER_DATABASE_URL:")
    for name, result, good in lines:
        status = "ok" if good else "not yet" if name == "raw" else "NOT OK"
        print(f"  {name:<9}{result:<40}{status}")

    if failed:
        print("Final state: no. " + ", ".join(failed) + " must be fixed.")
    elif raw_left:
        print("Final state: not yet. raw is still readable, as expected after --grant-only; the full apply removes it.")
    else:
        print("Final state: yes. web_reader reads marts only.")
    return not failed


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m pipeline.create_web_reader", description=__doc__.splitlines()[0])
    parser.add_argument("--grant-only", action="store_true", help="apply web_reader.sql only (expand: add marts, keep raw)")
    parser.add_argument("--keep-password", action="store_true", help="keep the current password, so Vercel needs no change")
    parser.add_argument("--check", action="store_true", help="report what web_reader can read and write; change nothing")
    args = parser.parse_args()

    env = dotenv_values(ENV_PATH)
    if args.check:
        if args.grant_only or args.keep_password:
            parser.error("--check changes nothing, so it takes no other option")
        sys.exit(0 if check(env["WEB_READER_DATABASE_URL"]) else 1)

    apply(env["NEON_DATABASE_URL"], args.grant_only, args.keep_password)


if __name__ == "__main__":
    main()
