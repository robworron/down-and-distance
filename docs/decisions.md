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
