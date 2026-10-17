# Data model

How the database is laid out, table by table. Three schemas, one per layer:

| Schema    | Built by         | Holds                                              |
| --------- | ---------------- | -------------------------------------------------- |
| `raw`     | Python pipeline  | Copies of the sources, as-is                       |
| `staging` | dbt (Phase 2)    | One cleaned model per raw table                    |
| `marts`   | dbt (Phase 2)    | The tables the website reads                       |

## Raw layer

### Conventions

- **Source as-is.** Column names, values and rows are kept exactly as the source publishes them. Renaming, type fixes and team-code standardising happen in staging.
- **`_loaded_at`.** Every raw table has a `_loaded_at timestamptz` column: when the row was inserted or last changed. A reload that finds a row unchanged leaves it, and its `_loaded_at`, untouched.
- **Primary key on every table.** Loads upsert on it: new keys are inserted, changed rows are updated in place, and the table is never dropped (so grants survive).
- **Stale rows are removed per season.** Loading a season also deletes that season's rows whose key is no longer in the source (e.g. a cancelled game, or a play nflverse deleted). Other seasons are untouched, and a season that arrives empty is refused rather than wiped.
- **Integers stay integers.** Columns that are integers at the source are stored as integers even when they contain nulls.
- **Loads are idempotent.** Running the same load twice changes nothing the second time.

### Loading

One command loads every raw table, in dependency order (schedules, teams, weather, play-by-play):

```
uv run python -m pipeline ingest                       # current season only (the nightly job)
uv run python -m pipeline ingest --full                # schedules 1999-, weather 2000-, play-by-play 2016-
uv run python -m pipeline ingest --seasons 2020-2022   # chosen seasons
uv run python -m pipeline ingest --only weather,pbp    # a subset of tables
```

Each table logs inserted / updated / unchanged / deleted counts. A second run straight after the first logs no changes (step 1.8). On the season in progress, a run a few hours later can update a handful of upcoming games, because betting lines move.

### Checks

`uv run pytest` runs three sets of tests (step 1.9):

- `pipeline/tests/test_raw_data.py`: data checks against whatever `DATABASE_URL` points at, so it also runs against Neon. It covers regular-season games per season, that team codes resolve, no duplicate keys, weather coverage over 99%, snowfall in the 2017 snow game, no play-by-play for unknown games, play-by-play for every finished game since 2016, every stadium in the seed, and seed time zones matching their coordinates. The first two run the SQL in `pipeline/sql/checks/`.
- `pipeline/tests/test_transforms.py`: unit tests for kickoff times (daylight saving time, half-hour rounding), game-window weather, and play-by-play integer conversion. No database needed.
- `pipeline/tests/test_upsert.py`: unit tests for the upsert (insert, update, NULL changes, stale-row deletes, empty-season refusal, new columns, types) on throwaway schemas. Marked `local_only`; skipped unless `DATABASE_URL` is the local Docker database.

### Production (Neon)

Loaded on 2026-10-17 (step 1.10) with `ingest --full`, `DATABASE_URL` set to the Neon owner connection for that one command. `test_raw_data.py` passes against Neon (12 checks), and an immediate nightly-style `ingest` changes nothing.

| Table | Rows | Size |
| ----- | ---- | ---- |
| `raw.schedules` | 7,548 | 3.6 MB |
| `raw.teams` | 36 | 72 kB |
| `raw.game_weather` | 5,945 | 1.3 MB |
| `raw.pbp` | 498,285 | 182 MB |
| Whole database | | 195 MB of the 1 GB free plan |

`web_reader` reads all four tables through the default privileges in `raw` (see `decisions.md`; narrowed to `marts` in step 4.1).

### Tables

| Table              | Source                         | Grain (one row per…)  | Primary key           | Seasons          |
| ------------------ | ------------------------------ | --------------------- | --------------------- | ---------------- |
| `raw.schedules`    | nflverse `load_schedules()`    | game                  | `game_id`             | 1999 to present  |
| `raw.teams`        | nflverse `load_teams()`        | team code             | `team_abbr`           | n/a              |
| `raw.game_weather` | Open-Meteo archive API         | game                  | `game_id`             | 2000 to present  |
| `raw.pbp`          | nflverse `load_pbp()`          | play                  | `(game_id, play_id)`  | 2016 to present  |

#### raw.schedules

Every game since 1999, regular season and playoffs, including scheduled games not yet played. `game_id` looks like `2017_14_IND_BUF` (season, week, away team, home team).

Idempotency proof (step 1.3, 2026-10-16, local):

| Test | Load | Result |
| ---- | ---- | ------ |
| Rerun 1999–2026 back to back | `--seasons 1999-2026` | 0 inserted, 0 updated, 7548 unchanged, 0 deleted; count stays 7548 |
| Set `2017_14_IND_BUF` home score to 99 | `--seasons 2017` | 1 updated; score back to 13 |
| Insert fake game `2017_99_XXX_YYY` | `--seasons 2018` | 0 deleted; the fake 2017 row survives (other seasons untouched) |
| Same fake row still present | `--seasons 2017` | 1 deleted; the row is gone, count back to 7548 |

An earlier rerun reported 2 updated: the betting lines for two upcoming 2026 games had moved at the source. That is a real change, not a broken load.

#### raw.teams

Team names, conference, division, colours and logos. Keyed on `team_abbr`, which includes old codes for relocated teams (OAK, SD, STL), so every code in schedules resolves.

#### raw.game_weather

Weather at each game's stadium from Open-Meteo's historical archive (ERA5 reanalysis). One row per finished game from 2000 on (1999 has no kickoff times) outside a fixed dome; retractable-roof games are included, since the open/closed state comes from schedules. Loaded by `pipeline/load_weather.py`; key `game_id`, stale rows deleted per `season`.

| Column | Meaning |
| ------ | ------- |
| `game_id`, `season` | From schedules |
| `kickoff_utc` | `gameday` + `gametime` (US Eastern) converted to UTC; the kickoff hour `k` is this rounded to the nearest hour, half-hours rounding up |
| `latitude`, `longitude` | The stadium's coordinates from `stadiums.csv` |
| `temperature_f`, `precipitation_in`, `snowfall_in`, `wind_mph`, `wind_gust_mph` | **Kickoff hour**: values at hour `k` |
| `temperature_avg_f` | **Game window**: mean of hours `k`…`k+3` |
| `wind_max_mph`, `wind_gust_max_mph` | **Game window**: max of hours `k`…`k+3` (10 m wind speed and gusts) |
| `precipitation_total_in`, `snowfall_total_in` | **Game window**: sum of hours `k+1`…`k+3` |

Open-Meteo's hourly precipitation and snowfall are totals for the *preceding* hour, so the value at `k` covers the hour before kickoff and the sum of `k+1`…`k+3` covers exactly the three hours after it. Temperature and wind are instantaneous readings.

**Phase 2 buckets (temperature, precipitation, wind) should use the game-window values**, which describe the conditions the game was played in. The kickoff-hour values are kept for comparison with nflverse's `temp` and `wind`.

Checks at load (step 1.6, 2026-10-16, local): 100% of finished outdoor and open-roof games from 2000 have weather (5,309 of 5,309; `pipeline/sql/checks/weather_coverage.sql`). Against nflverse's `temp` over 5,054 games: correlation 0.978, mean gap −0.3 °F, median absolute gap 1.9 °F (`weather_vs_nflverse_temp.sql`). The 2017 Colts–Bills snow game shows 0.25 in of snow in the kickoff hour and 0.99 in over the game window.

#### raw.pbp

Play-by-play from 2016, trimmed to 60 of nflverse's 372 columns (chosen and justified in `notebooks/01_pbp_columns.ipynb`, step 1.7a). `play_id` is unique only within a game, so the key is the pair `(game_id, play_id)`. Loaded by `pipeline/load_pbp.py`, one season at a time; stale plays deleted per `season`.

| Group | Columns |
| ----- | ------- |
| Keys and context | `game_id`, `play_id`, `season`, `week`, `season_type`, `posteam`, `defteam`, `posteam_type` |
| Game state | `qtr`, `down`, `ydstogo`, `yardline_100`, `goal_to_go`, `game_seconds_remaining`, `score_differential` |
| Drives | `fixed_drive`, `fixed_drive_result` |
| Play type and filters | `play_type`, `pass`, `rush`, `qb_dropback`, `qb_scramble`, `qb_kneel`, `qb_spike`, `aborted_play`, `two_point_attempt` |
| Play value | `epa`, `success`, `yards_gained`, `first_down` |
| Win probability | `wp`, `wpa` |
| Passing | `pass_attempt`, `complete_pass`, `air_yards`, `cpoe`, `pass_oe` |
| Rushing | `rush_attempt` |
| Turnovers and sacks | `interception`, `fumble`, `fumble_lost`, `sack` |
| Scoring | `touchdown`, `pass_touchdown`, `rush_touchdown`, `return_touchdown`, `td_team`, `safety` |
| Third and fourth down | `third_down_converted`, `third_down_failed`, `fourth_down_converted`, `fourth_down_failed` |
| Penalties | `penalty`, `penalty_team`, `penalty_yards` |
| Kicking | `field_goal_attempt`, `field_goal_result`, `extra_point_result`, `punt_attempt` |
| Text | `desc` |

**Types.** nflverse publishes most numeric columns as decimals even when they only hold whole numbers. The 41 whole-number columns (0/1 flags, downs, yards, clock, `play_id`) are stored as `smallint` (`play_id` as `integer`); the load stops if a value isn't whole or doesn't fit. Only `epa`, `wp`, `wpa`, `cpoe` and `pass_oe` are `double precision`. `pass` and `rush` already exclude kneels and spikes.

**Indexes.** The primary key `(game_id, play_id)` is a B-tree sorted by `game_id` first, so it also serves lookups by `game_id` alone (`EXPLAIN` shows an index scan on `pbp_pkey`). `pbp_season_posteam_idx` on `(season, posteam)` serves per-team queries.

**Size (step 1.7, 2026-10-16, local):** 498,285 plays in 2,841 games, 2016 to 2026 week 6. 197 MB in total: 159 MB table, 33 MB primary key, 5 MB `(season, posteam)` index. Every `game_id` exists in `raw.schedules`.

## Seeds

Hand-made reference CSVs in `transform/seeds/`, loaded by `dbt seed` from Phase 2.

| Seed                | Grain                | Key           | Purpose                                                         |
| ------------------- | -------------------- | ------------- | --------------------------------------------------------------- |
| `stadiums.csv`      | stadium              | `stadium_id`  | Coordinates, IANA time zone, altitude, roof and surface (1.5)   |
| `team_code_map.csv` | old team code        | `old_code`    | Maps relocated teams' codes to today's code, e.g. OAK→LV (1.4)  |

### stadiums.csv

One row per `stadium_id` used in `raw.schedules` (67 as of 2026). Columns:

| Column | Meaning |
| ------ | ------- |
| `stadium_id`, `name` | nflverse's id; the current name, with the old one in brackets |
| `city`, `region`, `country` | The stadium's actual municipality (e.g. Foxborough, East Rutherford, Santa Clara), state/province, ISO country code |
| `latitude`, `longitude` | Centre of the field |
| `timezone` | IANA zone name (e.g. `America/Phoenix`, which skips daylight saving time) |
| `altitude_m` | Elevation from Open-Meteo's elevation API, metres |
| `roof` | Physical roof type: `outdoors`, `dome` or `retractable`. Whether a retractable roof was open for a game comes from schedules. |
| `surface` | Most common non-blank surface in schedules for that stadium, in nflverse's vocabulary |

`pipeline/validate_stadiums.py` checks every row: ids match schedules both ways, the time zone matches `timezonefinder` for the coordinates, and the stadium is within 30 km of its geocoded municipality.

nflverse lists several upcoming 2026 international games with placeholder roofs (Melbourne Cricket Ground, Allianz Arena and Stade de France as `dome`; Bernabeu blank). The CSV records their real roof types.
