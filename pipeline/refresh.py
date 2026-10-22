"""Tell the site that the marts changed, then check its main pages.

    uv run python -m pipeline refresh --site http://localhost:3001
    uv run python -m pipeline refresh                     # --site from SITE_URL
    uv run python -m pipeline refresh --expect-stamp      # also check the footer stamp

POSTs to the site's /api/revalidate with `Authorization: Bearer
<REVALIDATE_SECRET>` (from .env or the environment). The site then expires
every cached marts query, and the next visit to each page renders with the
new data. Afterwards each main page is requested once, so the first real
visitor doesn't wait for that render, and the result is printed.

Network errors and 5xx answers are retried, 3 times with growing waits.
401 (wrong secret) and 503 (no secret on the site) are not: they're
configuration errors that a retry can't fix.

--expect-stamp then reads the newest stamp from marts.data_freshness
(DATABASE_URL) and checks that every main page's footer shows it, in its
<time datetime>, retrying for up to 2 minutes: the proof that the refresh
reached the pages people see.

Exit codes: 0 refreshed and every page answered 200 (and, with
--expect-stamp, showed the stamp); 1 the refresh was refused or failed; 2
refreshed, but a page check or the stamp check failed. The secret is never
printed.
"""

import argparse
import os
import re
import sys
import time
from collections.abc import Callable

import requests
from dotenv import load_dotenv

PAGES = ["/", "/teams", "/teams/buf", "/explorer", "/leaderboards", "/this-week"]
RETRIES = 3
BACKOFF_SECONDS = 2.0  # waits of 2, 4 and 8 seconds before the three retries
TIMEOUT_SECONDS = 30
STAMP_WAIT_SECONDS = 120
STAMP_RETRY_SECONDS = 10
# React writes the dateTime prop as the HTML attribute "datetime".
STAMP = re.compile(r'<time dateTime="([^"]+)"', re.IGNORECASE)
# The same text the site shows (getDataUpdatedAt in web/lib/queries.ts).
STAMP_SQL = """
    SELECT to_char(last_success_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    FROM marts.data_freshness WHERE table_name = 'schedules'
"""

OK, REFRESH_FAILED, PAGE_CHECK_FAILED = 0, 1, 2


def revalidate(
    site: str,
    secret: str,
    post: Callable[..., requests.Response] = requests.post,
    sleep: Callable[[float], None] = time.sleep,
) -> bool:
    """POST to the refresh route; True if the site answered 200."""
    url = f"{site}/api/revalidate"
    for attempt in range(RETRIES + 1):
        if attempt:
            wait = BACKOFF_SECONDS * 2 ** (attempt - 1)
            print(f"  retrying in {wait:.0f} s ({attempt} of {RETRIES})")
            sleep(wait)
        try:
            response = post(url, headers={"Authorization": f"Bearer {secret}"}, timeout=TIMEOUT_SECONDS)
        except requests.RequestException as error:
            # The exception's class only: its message can repeat the request.
            print(f"refresh: no answer from {url} ({type(error).__name__})")
            continue
        if response.status_code == 200:
            print(f"refresh: 200 from {url}")
            return True
        if response.status_code == 401:
            print("refresh: 401, the site refused the secret. Check REVALIDATE_SECRET here and on the site.")
            return False
        if response.status_code == 503:
            print("refresh: 503, the site has no REVALIDATE_SECRET set.")
            return False
        print(f"refresh: {response.status_code} from {url}")
        if response.status_code < 500:
            return False
    print(f"refresh: gave up after {RETRIES} retries")
    return False


def check_pages(site: str, get: Callable[..., requests.Response] = requests.get) -> bool:
    """Request each main page once; True if all answered 200."""
    ok = True
    for path in PAGES:
        started = time.monotonic()
        try:
            status = str(get(f"{site}{path}", timeout=TIMEOUT_SECONDS).status_code)
        except requests.RequestException as error:
            status = type(error).__name__
        took = time.monotonic() - started
        good = status == "200"
        ok &= good
        print(f"  {'ok  ' if good else 'FAIL'}  {status:>4}  {took:5.2f} s  {path}")
    return ok


def published_stamp() -> str | None:
    """The newest schedules stamp in marts.data_freshness, as the site formats it."""
    import psycopg

    from pipeline.db import database_url

    with psycopg.connect(database_url()) as conn:
        row = conn.execute(STAMP_SQL).fetchone()
    return row[0] if row else None


def check_stamp(
    site: str,
    expected: str,
    get: Callable[..., requests.Response] = requests.get,
    sleep: Callable[[float], None] = time.sleep,
    wait: float = STAMP_WAIT_SECONDS,
) -> bool:
    """True once every main page's footer shows the expected stamp; retries for `wait` seconds."""
    waited = 0.0
    while True:
        shown = {}
        for path in PAGES:
            try:
                match = STAMP.search(get(f"{site}{path}", timeout=TIMEOUT_SECONDS).text)
                shown[path] = match.group(1) if match else "no stamp"
            except requests.RequestException as error:
                shown[path] = type(error).__name__
        behind = {p: v for p, v in shown.items() if v != expected}
        if not behind:
            print(f"stamp: every page shows {expected}")
            return True
        if waited >= wait:
            for path, value in behind.items():
                print(f"stamp: {path} shows {value}, expected {expected}")
            return False
        print(f"stamp: {len(behind)} of {len(PAGES)} pages not showing {expected} yet; checking again in {STAMP_RETRY_SECONDS} s")
        sleep(STAMP_RETRY_SECONDS)
        waited += STAMP_RETRY_SECONDS


def refresh(
    site: str,
    secret: str | None,
    post: Callable[..., requests.Response] = requests.post,
    get: Callable[..., requests.Response] = requests.get,
    sleep: Callable[[float], None] = time.sleep,
    expected_stamp: Callable[[], str | None] | None = None,
) -> int:
    """Refresh the site's cache, then check its pages (and the stamp); returns an exit code."""
    site = site.rstrip("/")
    if not secret:
        print("refresh: REVALIDATE_SECRET isn't set (.env or the environment)")
        return REFRESH_FAILED
    if not revalidate(site, secret, post=post, sleep=sleep):
        return REFRESH_FAILED
    print("pages:")
    if not check_pages(site, get=get):
        return PAGE_CHECK_FAILED
    if expected_stamp is not None:
        stamp = expected_stamp()
        if stamp is None:
            print("stamp: marts.data_freshness has no schedules stamp")
            return PAGE_CHECK_FAILED
        if not check_stamp(site, stamp, get=get, sleep=sleep):
            return PAGE_CHECK_FAILED
    return OK


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(prog="python -m pipeline refresh", description=__doc__.splitlines()[0])
    parser.add_argument("--site", default=os.environ.get("SITE_URL"), help="the site's base URL (default: SITE_URL)")
    parser.add_argument("--expect-stamp", action="store_true", help="check every page shows marts.data_freshness's stamp")
    args = parser.parse_args(argv)
    if not args.site:
        parser.error("give --site or set SITE_URL")
    return refresh(args.site, os.environ.get("REVALIDATE_SECRET"), expected_stamp=published_stamp if args.expect_stamp else None)


if __name__ == "__main__":
    sys.exit(main())
