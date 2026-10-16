"""Parsing the --seasons argument shared by the loaders."""

import nflreadpy as nfl


def current_season() -> int:
    """The NFL season in progress (or the next one, in the offseason)."""
    return nfl.get_current_season()


def parse_seasons(text: str | None) -> list[int]:
    """Turn '2025', '1999-2026' or '2016,2018-2020' into a sorted list of seasons.

    None means the current season only.
    """
    if not text:
        return [current_season()]
    seasons: set[int] = set()
    for part in text.split(","):
        start, _, end = part.strip().partition("-")
        seasons.update(range(int(start), int(end or start) + 1))
    return sorted(seasons)
