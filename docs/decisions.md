# Decisions

Where the project deviates from `docs/build-plan.md`, and why. Newest last. Where this log and the plan disagree, this log wins.

## 2026-10-15 — Python 3.13, not the latest (step 0.4)

- **Changed:** the project is pinned to Python 3.13 in `.python-version` (`requires-python = ">=3.13"`), although 3.14 was installed globally.
- **Why:** dbt Core (step 2.2) typically lags new Python releases. Pinning now avoids rebuilding the environment later.

## 2026-10-15 — pandas and pyarrow added (step 0.5)

- **Changed:** `pandas` and `pyarrow` were added to the dependencies, which the plan didn't list for Phase 0.
- **Why:** writing a dataframe to Postgres through SQLAlchemy goes via pandas, and pyarrow makes the Polars-to-pandas conversion fast. Both would have arrived with the Phase 3 notebooks anyway.

## 2026-10-16 — Postgres 18, not 17 (step 0.8)

- **Changed:** local Docker runs `postgres:18`, and the volume is mounted at `/var/lib/postgresql`, the layout the 18 image expects.
- **Why:** the plan says to match Neon's major version, and the Neon project was created on Postgres 18. The local volume was recreated, and only the reloadable 2025 schedule was lost.

## 2026-10-16 — Local host port 15432 (step 0.8)

- **Changed:** `docker-compose.yml` maps host port `15432` to the container's 5432. Local `DATABASE_URL` and DBeaver use 15432.
- **Why:** after a Windows restart, WinNAT reserved TCP 5427–5526, which blocks both 5432 and the plan's fallback, 5433. 15432 sits outside the reserved ranges. Freeing the range would mean changing a Windows networking service.

## 2026-10-16 — web_reader reads all of `raw` until step 4.1 (step 0.10)

- **Changed:** `web_reader` has `SELECT` on every table in `raw`, through `ALTER DEFAULT PRIVILEGES`. The plan said `raw.schedules` only.
- **Why:** the Phase 0 loader replaces the table on every run, which drops table-level grants. Default privileges keep the site working through reloads. Every `web_reader` session is also read-only (`default_transaction_read_only`). In step 4.1, revoke `raw` and grant `marts` only.

## 2026-10-16 — pandas instead of Polars

- **Changed:** all project code uses pandas. nflreadpy's Polars output is converted with `.to_pandas()` immediately after loading. Polars was removed as a direct dependency and stays installed only because nflreadpy needs it. The Phase 0 loader now writes with `DataFrame.to_sql`.
- **Why:** pandas is the industry standard for analyst work, and it's what Rob can explain in interviews.

## 2026-10-16 — 2022 has 271 regular-season games (step 1.2)

- **Changed:** the 1.2 check expects 272 regular-season games from 2021, except **271 in 2022**.
- **Why:** the Week 17 Bills–Bengals game was cancelled after Damar Hamlin's cardiac arrest and never replayed. nflverse correctly omits it.

## 2026-10-16 — raw.schedules recreated with a primary key (step 1.2)

- **Changed:** the Phase 0 `raw.schedules` (no primary key, types inferred from 2025 alone) was dropped and rebuilt from 1999–2026 with `game_id` as its primary key. Neon's copy is rebuilt the same way in step 1.10.
- **Why:** upserts need a primary key, and types inferred from one season can be wrong for others. The table is fully reloadable from nflverse.

## 2026-10-16 — Upserts also delete stale rows, per season (step 1.2)

- **Changed:** `upsert_dataframe` in `pipeline/db.py` deletes rows in the seasons being loaded whose key is no longer in the source, and logs the count. This applies to `raw.schedules`, `raw.game_weather` and `raw.pbp`; `raw.teams` is upsert-only. A requested season that arrives with no rows raises an error rather than being wiped.
- **Why:** a plain upsert never removes anything, so a cancelled game or a play nflverse deletes would linger in `raw` forever. Scoping the delete to the loaded seasons keeps a current-season-only run from touching history.

## 2026-10-16 — Integer columns stay integers when they contain nulls (step 1.2)

- **Changed:** loaders convert nflverse data with `nflverse_to_pandas` (`pipeline/db.py`), which maps every Arrow integer type to pandas' nullable `Int64`, instead of a bare `.to_pandas()`. Those columns are `bigint` in Postgres.
- **Why:** pandas' default turns an integer column with nulls (e.g. scores of unplayed games) into float64, so scores would be stored as 24.0.

## 2026-10-16 — Claude writes the "You try first" steps (step 1.2)

- **Changed:** steps marked **You try first** (and Done-when SQL checks) are no longer hand-backs. Claude Code writes the solution with clause-by-clause comments, and walks through it after the check passes. `CLAUDE.md` is updated to match.
- **Why:** Rob would rather keep the build moving and learn query-building afterwards from finished, working, commented queries.

## 2026-10-16 — stadiums.csv: region column and physical roof type (step 1.5)

- **Changed:** `stadiums.csv` has a `region` (state/province) column, and its `roof` column holds the stadium's physical roof type (`outdoors` / `dome` / `retractable`) rather than the most common per-game value from schedules. `requests` was added as a dependency and `timezonefinder` as a dev dependency.
- **Why:** `region` lets the geocoding check tell Arlington, TX from Arlington, VA. Per-game roof values describe a game's state (`open` / `closed`) and include wrong placeholders for upcoming 2026 international games; the seed describes the building.
- **Verified 2026-10-17:** every open-air international venue is `outdoors` in the seed: the Melbourne Cricket Ground, Allianz Arena (both `GER00` and `MUN01`), Stade de France, Wembley, Twickenham, Tottenham, Azteca, Maracanã and Arena Corinthians. Rogers Centre, Deutsche Bank Park and the Bernabéu are `retractable`. Across all 67 stadiums, nflverse's per-game roof contradicts the seed only for MEL00, MUN01 and PAR00, which it lists as `dome`. No corrections were needed.

## 2026-10-16 — Weather: no 1999, and game-window values (step 1.6)

- **Changed:** `raw.game_weather` starts in 2000, because nflverse has no kickoff time for any 1999 game. The 99% coverage check covers games with a known kickoff time. Beside the kickoff-hour values, each game also stores game-window values from kickoff to kickoff + 3 hours: average temperature, maximum wind and gusts, and total precipitation and snowfall. Weather is skipped for fixed domes, using `stadiums.csv`'s physical roof type.
- **Why:** an hour can't be matched without a kickoff time. A single kickoff-hour reading misses rain or snow that starts mid-game, so Phase 2 buckets use the window values.
- **Also:** the kickoff hour is the nearest UTC hour with half-hours rounding *up*. pandas' `.dt.round` rounds exact half-hours to the nearest even hour, which rounded 149 kickoffs down (mostly 8:30 pm ET night games during daylight saving time) and others up. The first full load used it; the fix reloaded those 149 games from the cache.

## 2026-10-16 — raw.pbp stores whole-number columns as integers (step 1.7)

- **Changed:** the 41 play-by-play columns that nflverse publishes as decimals but that only hold whole numbers (0/1 flags, down, yards, clock, `play_id`) are stored as `smallint` (`play_id` as `integer`) rather than `double precision`. The loader refuses any value that isn't whole or doesn't fit.
- **Why:** measured on 2025, it cuts `raw.pbp` from about 330 MB to about 205 MB for 11 seasons, with identical values (checked for every season 2016–2026). Rob chose this over strict as-is types at the 1.7a review.

## 2026-10-16 — No separate game_id index on raw.pbp (step 1.7)

- **Changed:** step 1.7d asked for indexes on `game_id` and `(season, posteam)`. Only `(season, posteam)` was added.
- **Why:** the primary key `(game_id, play_id)` is already a B-tree index led by `game_id`, and `EXPLAIN` confirms that a `WHERE game_id = …` query uses it. A second index would cost about 15 MB of Neon storage for nothing.

## 2026-10-17 — The Phase 0 page filters to 2025 (step 1.10)

- **Changed:** `getSchedules` in `web/lib/queries.ts` takes a season (the page passes 2025, as a SQL parameter) and casts `week` and the scores to `int`. This was pushed and deployed before Neon's `raw.schedules` was rebuilt.
- **Why:** the page read all of `raw.schedules`, which held only 2025 until the full reload. Without the filter, the live page titled "2025 schedule" would have listed all 7,548 games from 1999. The casts are needed because the rebuilt columns are `bigint`, which the `pg` driver returns as strings. Rob approved the push. The page is replaced in Phase 4.

## 2026-10-17 — Weather coverage counts games played in the open (step 1.6 check)

- **Changed:** the coverage check (`pipeline/sql/checks/weather_coverage.sql`, run by `test_weather_coverage`) counts a game when its own roof in schedules is `outdoors`/`open` **or** its stadium has no roof in `stadiums.csv`. Before, it trusted schedules' roof alone. It now covers 5,310 games, all with weather. `stadiums.csv` isn't in the database until Phase 2, so the SQL types in its 47 roofless stadiums, and `test_open_air_list_matches_seed` fails if that list drifts from the CSV. `test_mislabelled_open_air_game_has_weather` checks the Melbourne game directly.
- **Why:** nflverse lists the 2026 Melbourne Cricket Ground game as `dome`, although the MCG has no roof, so the old rule silently left a real open-air game unchecked. Munich and Paris carry the same label for games not yet played. This matches the rule Phase 2 must use (see `docs/data-model.md`, `raw.game_weather`): closed-roof games get no weather; roofless stadiums always do.

## 2026-10-17 — Weather rules for Phase 2 (from Phase 1 findings)

- **Changed:** step 2.5's weather situations follow three rules, detailed in `docs/data-model.md` under `raw.game_weather`:
  1. Buckets use the **game-window** values (kickoff to kickoff + 3 h), not the kickoff hour.
  2. Weather applies only to games **played in the open**: the game's roof in schedules is `outdoors`/`open`, or `stadiums.csv` says the stadium has no roof. Closed-roof games (629, plus 6 at Toronto's Rogers Centre) get null weather buckets, although `raw.game_weather` has rows for them.
  3. Precipitation and snowfall are bucketed **none / light / heavy**, with thresholds chosen in 2.5, rather than used as exact amounts. Snow when `snowfall_total_in` > 0, otherwise rain when `precipitation_total_in` > 0. This refines the plan's v1 situation (none / rain / snow) with an intensity; settle the final value set in 2.5.
- **Why:** retractable-roof stadiums get weather rows whatever the roof did, and nflverse mislabels some roofless venues as `dome`. Open-Meteo's amounts come from models on a grid roughly 10–30 km across, which smooths out local squalls: the 2017 Buffalo snow game shows only 0.99 in. Temperature and wind agree well with nflverse (r = 0.978), so they can be bucketed as planned.
