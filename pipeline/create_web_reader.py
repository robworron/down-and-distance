"""Create the read-only web_reader role in Neon and save its connection string.

Runs pipeline/sql/web_reader.sql as the owner (NEON_DATABASE_URL), gives the
role a fresh random password, and writes WEB_READER_DATABASE_URL (pooled host,
for Vercel) to .env. Secrets are never printed. Rerunning rotates the password.
"""

import secrets
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import psycopg
from dotenv import dotenv_values, set_key
from psycopg import sql

ENV_PATH = Path(".env")
SQL_PATH = Path(__file__).parent / "sql" / "web_reader.sql"


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


def main() -> None:
    owner_url = dotenv_values(ENV_PATH)["NEON_DATABASE_URL"]
    password = secrets.token_urlsafe(32)

    with psycopg.connect(owner_url, autocommit=True) as conn:
        conn.execute(SQL_PATH.read_text())
        conn.execute(sql.SQL("ALTER ROLE web_reader PASSWORD {}").format(sql.Literal(password)))

    set_key(ENV_PATH, "WEB_READER_DATABASE_URL", pooled_url(owner_url, "web_reader", password), quote_mode="never")
    print("web_reader ready; WEB_READER_DATABASE_URL saved to .env")


if __name__ == "__main__":
    main()
