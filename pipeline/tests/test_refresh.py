"""Unit tests for `pipeline refresh`: no site or network, the HTTP calls are fakes."""

import pytest
import requests

from pipeline import refresh as r

SITE = "https://site.test"
SECRET = "not-a-real-secret-0123456789"


class Answer:
    def __init__(self, status_code: int):
        self.status_code = status_code


def script(*answers):
    """A fake requests.post/get that gives each answer in turn (an exception class is raised)."""
    calls = []

    def call(url, **kwargs):
        calls.append((url, kwargs))
        answer = answers[min(len(calls), len(answers)) - 1]
        if isinstance(answer, type) and issubclass(answer, Exception):
            raise answer("boom")
        return Answer(answer)

    call.calls = calls
    return call


def no_sleep(seconds):
    no_sleep.waits.append(seconds)


@pytest.fixture(autouse=True)
def reset_waits():
    no_sleep.waits = []


def run(post, get=None):
    return r.refresh(SITE + "/", SECRET, post=post, get=get or script(200), sleep=no_sleep)


def test_success_posts_the_bearer_secret_then_checks_every_page(capsys):
    post, get = script(200), script(200)
    assert run(post, get) == r.OK
    [(url, kwargs)] = post.calls
    assert url == f"{SITE}/api/revalidate"
    assert kwargs["headers"] == {"Authorization": f"Bearer {SECRET}"}
    assert [u for u, _ in get.calls] == [f"{SITE}{p}" for p in r.PAGES]
    assert no_sleep.waits == []


@pytest.mark.parametrize("error", [requests.ConnectionError, requests.Timeout])
def test_retries_network_errors_then_succeeds(error):
    post = script(error, error, 200)
    assert run(post) == r.OK
    assert len(post.calls) == 3
    assert no_sleep.waits == [2.0, 4.0]


def test_retries_5xx_and_gives_up_after_three_retries():
    post = script(502)
    assert run(post) == r.REFRESH_FAILED
    assert len(post.calls) == 1 + r.RETRIES
    assert no_sleep.waits == [2.0, 4.0, 8.0]


@pytest.mark.parametrize("status", [401, 503, 404, 405])
def test_never_retries_a_refusal_or_misconfiguration(status):
    post = script(status)
    assert run(post) == r.REFRESH_FAILED
    assert len(post.calls) == 1
    assert no_sleep.waits == []


def test_a_failed_page_check_is_exit_2():
    get = script(200, 200, 500)
    assert run(script(200), get) == r.PAGE_CHECK_FAILED
    assert len(get.calls) == len(r.PAGES)  # the rest are still checked and printed


def test_a_page_that_doesnt_answer_is_exit_2():
    assert run(script(200), script(requests.ConnectionError)) == r.PAGE_CHECK_FAILED


def test_no_secret_is_exit_1_without_a_request():
    post = script(200)
    assert r.refresh(SITE, None, post=post, get=script(200), sleep=no_sleep) == r.REFRESH_FAILED
    assert r.refresh(SITE, "", post=post, get=script(200), sleep=no_sleep) == r.REFRESH_FAILED
    assert post.calls == []


@pytest.mark.parametrize(
    "post",
    [script(200), script(401), script(503), script(502), script(requests.ConnectionError)],
)
def test_the_secret_is_never_printed(post, capsys):
    run(post, script(200, 500))
    out = capsys.readouterr()
    assert SECRET not in out.out + out.err


def test_main_needs_a_site(monkeypatch):
    monkeypatch.delenv("SITE_URL", raising=False)
    monkeypatch.setattr(r, "load_dotenv", lambda: None)
    with pytest.raises(SystemExit) as exit_info:
        r.main([])
    assert exit_info.value.code == 2  # argparse's usage error
