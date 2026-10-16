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

### Tables

| Table              | Source                         | Grain (one row per…)  | Primary key           | Seasons          |
| ------------------ | ------------------------------ | --------------------- | --------------------- | ---------------- |
| `raw.schedules`    | nflverse `load_schedules()`    | game                  | `game_id`             | 1999 to present  |
| `raw.teams`        | nflverse `load_teams()`        | team code             | `team_abbr`           | n/a              |
| `raw.game_weather` | Open-Meteo archive API         | game                  | `game_id`             | 2000 to present  |
| `raw.pbp`          | nflverse `load_pbp()`          | play                  | `(game_id, play_id)`  | 2016 to present  |

#### raw.schedules

Every game since 1999, regular season and playoffs, including scheduled games not yet played. `game_id` looks like `2017_14_IND_BUF` (season, week, away team, home team).

#### raw.teams

Team names, conference, division, colours and logos. Keyed on `team_abbr`, which includes old codes for relocated teams (OAK, SD, STL), so every code in schedules resolves.

#### raw.game_weather

Weather at each game's stadium, fetched from Open-Meteo at the kickoff hour. Columns are defined in step 1.6.

#### raw.pbp

Play-by-play, trimmed to the columns chosen in step 1.7a. `play_id` is unique only within a game, so the key is the pair `(game_id, play_id)`. Column list: to be added in step 1.7a.

## Seeds

Hand-made reference CSVs in `transform/seeds/`, loaded by `dbt seed` from Phase 2.

| Seed                | Grain                | Key           | Purpose                                                         |
| ------------------- | -------------------- | ------------- | --------------------------------------------------------------- |
| `stadiums.csv`      | stadium              | `stadium_id`  | Coordinates, IANA time zone, altitude, roof and surface (1.5)   |
| `team_code_map.csv` | old team code        | `old_code`    | Maps relocated teams' codes to today's code, e.g. OAK→LV (1.4)  |
