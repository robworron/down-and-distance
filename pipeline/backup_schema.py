"""Back up the database schema with pg_dump, and prove a backup restores.

    uv run python -m pipeline.backup_schema                         # Neon (NEON_DATABASE_URL)
    uv run python -m pipeline.backup_schema --from local            # local Docker (DATABASE_URL)
    uv run python -m pipeline.backup_schema --verify                # dump Neon, then the restore check
    uv run python -m pipeline.backup_schema --restore-check FILE    # restore check of an existing dump

The dump is schema-only (every CREATE statement, no rows: the data reloads from
nflverse). pg_dump runs inside the dnd-postgres container, so it matches Neon's
Postgres 18 without a local install. It writes two files to backups/
(gitignored): <source>-schema-<date>-<time>.dump, pg_dump's custom format,
which pg_restore can restore all or part of; and a .sql plain-text copy to read
and diff.

The restore check copies a dump into a throwaway local database, restore_check,
restores it with --no-owner --no-privileges (the roles are Neon's), compares
the tables and views per schema with the dump's table of contents, then drops
the database. It never touches the source database.

pg_dump reads only, inside one read-only transaction. The connection string is
split into libpq's PG* environment variables and handed to `docker exec` by
name, so it never appears on a command line, and nothing printed contains it.
"""

import argparse
import os
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from dotenv import dotenv_values

ENV_PATH = Path(".env")
BACKUP_DIR = Path("backups")
CONTAINER = "dnd-postgres"
RESTORE_DB = "restore_check"
SOURCES = {"neon": "NEON_DATABASE_URL", "local": "DATABASE_URL"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
# URL query parameters libpq can take from the environment instead.
QUERY_ENV = {"sslmode": "PGSSLMODE", "channel_binding": "PGCHANNELBINDING"}
# A TOC line: "<dump id>; <catalog oid> <oid> TABLE <schema> <name> <owner>".
TOC_RELATION = re.compile(r"^\d+; \d+ \d+ (TABLE|VIEW|MATERIALIZED VIEW) (\S+) (\S+) \S+$")
RELKINDS = {"r": "TABLE", "p": "TABLE", "v": "VIEW", "m": "MATERIALIZED VIEW"}


def libpq_env(url: str) -> dict[str, str]:
    """libpq's PG* variables for a postgresql:// URL, as pg_dump in the container sees it.

    The local database is published on host port 15432, but inside its own
    container it's on localhost:5432.
    """
    parts = urlsplit(url.replace("postgresql+psycopg://", "postgresql://", 1))
    local = parts.hostname in LOCAL_HOSTS
    env = {
        "PGHOST": "localhost" if local else parts.hostname or "",
        "PGPORT": "5432" if local else str(parts.port or 5432),
        "PGUSER": unquote(parts.username or ""),
        "PGPASSWORD": unquote(parts.password or ""),
        "PGDATABASE": parts.path.lstrip("/"),
    }
    for key, values in parse_qs(parts.query).items():
        if key not in QUERY_ENV:
            raise ValueError(f"unsupported connection option {key!r}")
        env[QUERY_ENV[key]] = values[0]
    return env


def redact(text: str, env: dict[str, str]) -> str:
    """Replace the host, user and password in text with ***, for error messages."""
    for name in ("PGPASSWORD", "PGHOST", "PGUSER"):
        if env.get(name) and env[name] != "localhost":
            text = text.replace(env[name], "***")
    return text


def toc_relations(toc: str) -> Counter:
    """Count the tables and views per (schema, kind) in `pg_restore --list` output."""
    counts: Counter = Counter()
    for line in toc.splitlines():
        if match := TOC_RELATION.match(line):
            kind, schema, _name = match.groups()
            counts[schema, kind] += 1
    return counts


def docker(*args: str, env: dict[str, str] | None = None) -> str:
    """Run a docker command; return stdout, or raise with stderr (redacted)."""
    result = subprocess.run(
        ["docker", *args],
        check=False,  # a failure is raised below, with stderr redacted
        env={**os.environ, **env} if env else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        command = " ".join(args[:3])
        raise RuntimeError(f"docker {command} ... failed:\n{redact(result.stderr.strip(), env or {})}")
    return result.stdout


def require_container() -> None:
    """Stop with instructions if the local Postgres container isn't running."""
    try:
        running = docker("inspect", "--format", "{{.State.Running}}", CONTAINER).strip() == "true"
    except (RuntimeError, FileNotFoundError):
        running = False
    if not running:
        sys.exit(f"The {CONTAINER} container isn't running: start Docker Desktop, then `docker compose up -d`.")


def print_counts(title: str, counts: Counter) -> None:
    print(title)
    for schema in sorted({schema for schema, _ in counts}):
        kinds = ", ".join(f"{n} {kind.lower()}s" for (s, kind), n in sorted(counts.items()) if s == schema)
        print(f"  {schema:<10}{kinds}")


def dump(source: str) -> Path:
    """pg_dump the source's schema into backups/; returns the .dump path."""
    env = libpq_env(dotenv_values(ENV_PATH)[SOURCES[source]])
    name = f"{source}-schema-{datetime.now():%Y-%m-%d-%H%M}"
    inside = f"/tmp/{name}"
    BACKUP_DIR.mkdir(exist_ok=True)
    if (BACKUP_DIR / f"{name}.dump").exists():
        sys.exit(f"{BACKUP_DIR / name}.dump already exists; wait a minute and rerun, so nothing is overwritten.")

    # `-e NAME` with no value copies NAME from this process's environment.
    pass_env = [arg for key in env for arg in ("-e", key)]
    try:
        docker("exec", *pass_env, CONTAINER, "pg_dump", "--schema-only", "--format=custom", f"--file={inside}.dump", env=env)
        # The plain-SQL copy and the table of contents need no connection.
        docker("exec", CONTAINER, "pg_restore", f"--file={inside}.sql", f"{inside}.dump")
        toc = docker("exec", CONTAINER, "pg_restore", "--list", f"{inside}.dump")
        for ext in (".dump", ".sql"):
            docker("cp", f"{CONTAINER}:{inside}{ext}", str(BACKUP_DIR / f"{name}{ext}"))
    finally:
        docker("exec", CONTAINER, "rm", "-f", f"{inside}.dump", f"{inside}.sql")

    entries = sum(1 for line in toc.splitlines() if line and not line.startswith(";"))
    print(f"Schema of {source} saved:")
    for ext in (".dump", ".sql"):
        path = BACKUP_DIR / f"{name}{ext}"
        print(f"  {path.as_posix():<48}{path.stat().st_size / 1024:>8.1f} KB")
    print_counts(f"{entries} objects in the dump; tables and views per schema:", toc_relations(toc))
    return BACKUP_DIR / f"{name}.dump"


def restore_check(path: Path) -> bool:
    """Restore a dump into a throwaway local database and compare it with the dump."""
    if not path.is_file():
        sys.exit(f"No such dump: {path}")
    user = dotenv_values(ENV_PATH)["POSTGRES_USER"]
    inside = f"/tmp/{path.name}"

    def psql(database: str, query: str) -> str:
        # Inside the container the image trusts local socket connections: no password.
        return docker("exec", CONTAINER, "psql", "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-Atc", query)

    if psql("postgres", f"SELECT 1 FROM pg_database WHERE datname = '{RESTORE_DB}'").strip():
        sys.exit(f"A database named {RESTORE_DB} already exists locally; drop it or check it, then rerun.")

    docker("cp", str(path), f"{CONTAINER}:{inside}")
    docker("exec", CONTAINER, "createdb", "-U", user, RESTORE_DB)
    try:
        toc = docker("exec", CONTAINER, "pg_restore", "--list", inside)
        # --exit-on-error: the first error stops the restore and fails the check.
        docker("exec", CONTAINER, "pg_restore", "-U", user, "-d", RESTORE_DB,
               "--no-owner", "--no-privileges", "--exit-on-error", inside)  # fmt: skip
        rows = psql(
            RESTORE_DB,
            "SELECT n.nspname, c.relkind, count(*) FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE c.relkind IN ('r', 'p', 'v', 'm') "
            "AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' "
            "GROUP BY 1, 2",
        )
    finally:
        docker("exec", CONTAINER, "dropdb", "-U", user, "--if-exists", RESTORE_DB)
        docker("exec", CONTAINER, "rm", "-f", inside)

    restored: Counter = Counter()
    for line in rows.splitlines():
        schema, relkind, n = line.split("|")
        restored[schema, RELKINDS[relkind]] += int(n)
    expected = toc_relations(toc)

    print(f"Restore check of {path.as_posix()} (local database {RESTORE_DB}, dropped afterwards):")
    print("  pg_restore: no errors")
    print_counts("  restored tables and views per schema:", restored)
    if restored == expected:
        print("  matches the dump's table of contents: yes")
        return True
    print(f"  matches the dump's table of contents: NO (expected {dict(expected)})")
    return False


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m pipeline.backup_schema", description=__doc__.splitlines()[0])
    parser.add_argument("--from", dest="source", choices=SOURCES, default="neon", help="database to dump (default neon)")
    parser.add_argument("--verify", action="store_true", help="after the dump, run the restore check on it")
    parser.add_argument("--restore-check", type=Path, metavar="FILE", help="only run the restore check on FILE")
    args = parser.parse_args()

    require_container()
    try:
        if args.restore_check:
            sys.exit(0 if restore_check(args.restore_check) else 1)
        path = dump(args.source)
        if args.verify:
            print()
            sys.exit(0 if restore_check(path) else 1)
    except RuntimeError as failed:
        sys.exit(f"FAILED: {failed}")


if __name__ == "__main__":
    main()
