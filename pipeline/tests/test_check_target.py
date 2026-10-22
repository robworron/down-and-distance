"""The nightly job's database-target check (step 1.6): no database or network needed.

Hostnames are resolved through a fake, so the tests never touch DNS.
"""

import socket

import pytest

from pipeline import check_target as ct

PASSWORD = "s3cret-pass"


def resolver(table: dict[str, list[str]]):
    """A fake getaddrinfo: a name resolves to its listed addresses, anything else fails."""

    def resolve(host, port):
        if host not in table:
            raise socket.gaierror("Name or service not known")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (a, 5432)) for a in table[host]]

    return resolve


NEON = "ep-quiet-sea-123456.us-east-2.aws.neon.tech"
REMOTE = resolver({NEON: ["3.215.10.20"], "localtest.me": ["127.0.0.1"], "sneaky.example": ["10.0.0.5", "::1"]})


def url(host: str, query: str = "sslmode=require") -> str:
    return f"postgresql://owner:{PASSWORD}@{host}/neondb?{query}"


def test_a_neon_url_passes():
    assert ct.problem(url(NEON), resolve=REMOTE) is None
    assert ct.problem(url(f"{NEON}:5432"), resolve=REMOTE) is None
    assert ct.problem(url("3.215.10.20:5432"), resolve=REMOTE) is None  # a remote IP needs no lookup


@pytest.mark.parametrize("host", ["localhost", "LOCALHOST", "localhost:15432", "localhost.", "db.localhost", "localhost.localdomain", "ip6-localhost"])
def test_localhost_in_any_spelling_is_refused(host):
    assert ct.problem(url(host), resolve=REMOTE) == "DATABASE_URL's host is localhost"


@pytest.mark.parametrize("host", ["127.0.0.1", "127.0.0.1:15432", "127.10.20.30", "[::1]", "[::1]:5432", "[::ffff:127.0.0.1]", "0.0.0.0", "[::]"])
def test_loopback_and_unspecified_addresses_are_refused(host):
    assert ct.problem(url(host), resolve=REMOTE) == "DATABASE_URL's host is a loopback or unspecified address"


@pytest.mark.parametrize("value", ["postgresql:///neondb", "postgresql://owner@/neondb", "postgresql://%2Fvar%2Frun%2Fpostgresql/neondb"])
def test_a_local_socket_is_refused(value):
    assert ct.problem(value, resolve=REMOTE) == "DATABASE_URL has no host, so it would use a local socket"


@pytest.mark.parametrize("query", ["host=localhost", "hostaddr=127.0.0.1", "host=/var/run/postgresql", "sslmode=require&hostaddr=::1"])
def test_a_local_host_in_the_options_is_refused(query):
    assert ct.problem(url(NEON, query), resolve=REMOTE) is not None


def test_every_host_in_a_list_is_checked():
    assert ct.problem(url(f"{NEON}:5432,localhost:15432"), resolve=REMOTE) == "DATABASE_URL's host is localhost"


def test_a_name_that_resolves_to_loopback_is_refused():
    assert ct.problem(url("localtest.me"), resolve=REMOTE) == "DATABASE_URL's host resolves to a loopback address"
    assert ct.problem(url("sneaky.example"), resolve=REMOTE) == "DATABASE_URL's host resolves to a loopback address"


def test_a_name_that_doesnt_resolve_is_refused():
    assert ct.problem(url("no-such-host.invalid"), resolve=REMOTE) == "DATABASE_URL's host doesn't resolve"


@pytest.mark.parametrize("value", [None, "", "mysql://u:p@db.example/x", "not a url at all"])
def test_empty_or_non_postgres_urls_are_refused(value):
    assert ct.problem(value, resolve=REMOTE) is not None


@pytest.mark.parametrize("value", [url("localhost:15432"), url(NEON)])
def test_main_never_prints_the_url_or_password(monkeypatch, capsys, value):
    monkeypatch.setenv("DATABASE_URL", value)
    monkeypatch.setenv("TARGET", "production")
    monkeypatch.setattr(ct.socket, "getaddrinfo", REMOTE)
    code = ct.main()
    out = capsys.readouterr()
    text = out.out + out.err
    assert PASSWORD not in text and "owner" not in text and NEON not in text and "15432" not in text
    assert code == (1 if "localhost" in value else 0)
    if code:
        assert text.startswith("::error::DATABASE_URL's host is localhost. The production environment's DATABASE_URL")
