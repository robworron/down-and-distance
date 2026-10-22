"""Refuse a DATABASE_URL that points at this machine, before the nightly job uses it.

    uv run python -m pipeline.check_target      # reads DATABASE_URL; exit 0 ok, 1 refused

On a GitHub runner the production and test databases are always remote
(Neon). A URL whose host is the runner itself (localhost, a loopback address,
a local socket) is a configuration mistake: once, the production
environment's secret held the local Docker URL. This check fails the run on
its first step instead, with a message that names the kind of problem and
never any part of the URL.

Refused, for every host the URL names (including libpq's host= / hostaddr=
options and a comma-separated host list):
- no host at all, or a socket path (/var/run/postgresql): a local socket;
- localhost in any spelling, and any name ending in .localhost;
- loopback and unspecified addresses: 127.0.0.0/8, ::1, IPv4-mapped
  ::ffff:127.x.x.x, 0.0.0.0 and ::;
- a hostname that resolves to one of those, or doesn't resolve at all.
"""

import ipaddress
import os
import socket
import sys
from collections.abc import Callable
from urllib.parse import parse_qs, unquote, urlsplit

SCHEMES = {"postgresql", "postgres", "postgresql+psycopg"}
LOCAL_NAMES = {"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"}

Resolver = Callable[..., list]


def _hosts(url: str) -> list[str]:
    """Every host the URL names: the netloc's (possibly a comma-separated list) and host= / hostaddr=."""
    parts = urlsplit(url)
    hostpart = parts.netloc.rsplit("@", 1)[-1]
    hosts = []
    for item in hostpart.split(","):
        if item.startswith("["):  # [::1]:5432
            hosts.append(item[1 : item.find("]")] if "]" in item else item[1:])
        elif item.count(":") == 1:  # host:port
            hosts.append(item.split(":", 1)[0])
        else:  # a bare host, or an unbracketed IPv6 address
            hosts.append(item)
    query = parse_qs(parts.query)
    for key in ("host", "hostaddr"):
        for value in query.get(key, []):
            hosts.extend(value.split(","))
    return [unquote(h).strip() for h in hosts]


def _is_local_ip(text: str) -> bool:
    try:
        ip = ipaddress.ip_address(text.split("%", 1)[0])  # drop an IPv6 zone id
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_loopback or ip.is_unspecified


def problem(url: str | None, resolve: Resolver = socket.getaddrinfo) -> str | None:
    """Why the URL can't be the nightly job's database, or None if it can. Never quotes the URL."""
    if not url:
        return "DATABASE_URL is empty"
    try:
        scheme = urlsplit(url).scheme
        hosts = _hosts(url)
    except ValueError:
        return "DATABASE_URL isn't a valid URL"
    if scheme not in SCHEMES:
        return "DATABASE_URL isn't a postgresql:// URL"
    for host in hosts:
        name = host.lower().rstrip(".")
        if not name or name.startswith("/"):
            return "DATABASE_URL has no host, so it would use a local socket"
        if name in LOCAL_NAMES or name.endswith(".localhost"):
            return "DATABASE_URL's host is localhost"
        if _is_local_ip(name):
            return "DATABASE_URL's host is a loopback or unspecified address"
        try:
            ipaddress.ip_address(name.split("%", 1)[0])
            continue  # a remote IP address: nothing to resolve
        except ValueError:
            pass
        try:
            addresses = {info[4][0] for info in resolve(name, None)}
        except (socket.gaierror, UnicodeError):
            return "DATABASE_URL's host doesn't resolve"
        if any(_is_local_ip(a) for a in addresses):
            return "DATABASE_URL's host resolves to a loopback address"
    return None


def main() -> int:
    target = os.environ.get("TARGET", "this")
    reason = problem(os.environ.get("DATABASE_URL"))
    if reason:
        # The ::error:: prefix makes GitHub show it as an annotation on the run.
        print(f"::error::{reason}. The {target} environment's DATABASE_URL must be the Neon connection string (direct host).")
        return 1
    print(f"DATABASE_URL points at a remote host (not shown); the {target} run can continue.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
