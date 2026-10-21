# Data model

How the database is laid out, table by table. Three schemas, one per layer:

| Schema    | Built by         | Holds                                              |
| --------- | ---------------- | -------------------------------------------------- |
| `raw`     | Python pipeline  | Copies of the sources, as-is                       |
| `staging` | dbt              | One cleaned model per raw table                    |
| `marts`   | dbt              | The tables the website reads                       |

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

Each table logs inserted / updated / unchanged / deleted counts. A second run straight after the first logs no changes. On the season in progress, a run a few hours later can update a handful of upcoming games, because betting lines move.

### Checks

`uv run pytest` runs four sets of tests:

- `pipeline/tests/test_raw_data.py`: data checks against whatever `DATABASE_URL` points at, so it also runs against Neon. It covers regular-season games per season, that team codes resolve, no duplicate keys, weather coverage over 99% (games played in the open, including stadiums nflverse mislabels), snowfall in the 2017 snow game, weather for the mislabelled Melbourne game, no play-by-play for unknown games, play-by-play for every finished game since 2016, every stadium in the seed, and seed time zones matching their coordinates. The first two run the SQL in `pipeline/sql/checks/`.
- `pipeline/tests/test_transforms.py`: unit tests for kickoff times (daylight saving time, half-hour rounding), game-window weather, and play-by-play integer conversion. No database needed.
- `pipeline/tests/test_upsert.py`: unit tests for the upsert (insert, update, NULL changes, stale-row deletes, empty-season refusal, new columns, types) on throwaway schemas. Marked `local_only`; skipped unless `DATABASE_URL` is the local Docker database.
- `pipeline/tests/test_analysis.py`: unit tests for the analysis helpers in `pipeline/analysis.py`: the season filter, the refusal of unknown mart names, win score with ties, leave-one-out strength, the bootstrap weights and venue baseline, the bootstrap SE against the textbook formula, Benjamini–Hochberg on a textbook example, and Fisher's exact p-values against scipy. No database needed.

### Production (Neon)

Loaded on 2026-10-17 with `ingest --full`, `DATABASE_URL` set to the Neon owner connection for that one command. `test_raw_data.py` passes against Neon (12 checks), and an immediate nightly-style `ingest` changes nothing.

| Table | Rows | Size |
| ----- | ---- | ---- |
| `raw.schedules` | 7,548 | 3.6 MB |
| `raw.teams` | 36 | 72 kB |
| `raw.game_weather` | 5,945 | 1.3 MB |
| `raw.pbp` | 498,285 | 182 MB |
| Whole database | | 195 MB of the 1 GB free plan |

`web_reader` reads all four tables through the default privileges in `raw` (see `decisions.md`; later narrowed to `marts`).

**Weather reload (2026-10-17).** Neon's `raw.game_weather` predated the schedule corrections. With Rob's approval it was reloaded from the Open-Meteo cache with `ingest --only weather --seasons 2000-2005,2016-2018,2025`: 1 inserted (the São Paulo game), 97 updated (91 re-timed kickoffs, 6 international games' coordinates), 2,144 unchanged, 0 deleted. Neon then matched local row for row (5,946 rows, 0 differences), and `test_raw_data.py` passed against Neon (16 checks).

**dbt build (2026-10-17).** `uv run python -m pipeline dbt build` with `DATABASE_URL` set to Neon for that one command: 290 of 290 passed in 31 seconds (4 seeds, 4 views, 6 tables, 276 tests). Every row count matches local, the 2020 home dip reads the same (.504), and every staging and marts column has its comment.

| Schema | Tables / views | Size | Rows |
| ------ | -------------- | ---- | ---- |
| `raw` | 4 tables | 187 MB | as above, with `raw.game_weather` now 5,946 |
| `staging` | 3 seeds + 4 views | 120 kB | views store nothing |
| `marts` | 7 tables | 17 MB | `games` 7,548 (2.0 MB) · `team_seasons` 893 · `team_game_stats` 5,682 (1.5 MB) · `team_games` 15,096 (6.7 MB) · `mart_team_splits` 37,619 (6.5 MB) · `mart_league_splits` 2,292 (0.4 MB) · `situations` 13 |
| Whole database | | **212 MB** of the 1 GB free plan | |

At that point the site read `raw.schedules`, and `web_reader` had no grant on `marts`; see below for the move to `marts`.

**Rebuild for the v1 situation list (2026-10-18).** With Rob's approval, `dbt build` ran against Neon after the registry change (three situations trimmed, rest advantage added): 292 of 292 passed in 37 seconds. Neon matches local on every check: `team_games` 15,096 rows, `mart_team_splits` 40,552, `mart_league_splits` 2,457, the 11 v1 and 3 trimmed situations, and the `rest_advantage` counts. The database is 213 MB of the 1 GB plan (marts 17 MB).

**The website reads `marts` only (2026-10-19).** The site queries the marts through Drizzle (`web/lib/queries.ts`) and nothing else. `web_reader`'s grants live in two files, both safe to rerun:
- `pipeline/sql/web_reader.sql`: `USAGE` on `marts`, `SELECT` on its tables, and default privileges, so the tables dbt recreates on every build are readable the moment they exist. On a fresh database this file alone is the whole setup.
- `pipeline/sql/web_reader_revoke_raw.sql`: removes the `raw` access the role had since the initial setup, including its default privileges.

On Neon the change ran in two phases on 2026-10-19, so the live site never lost what it was reading: the grants first (`create_web_reader --grant-only --keep-password`), then the deploy of the code that reads marts, then the revoke (`create_web_reader --keep-password`). `create_web_reader --check` connects as `web_reader` and reports what it can read and write. After the revoke it reads:

| Check | Result |
| ----- | ------ |
| `marts` | 7 of 7 tables readable |
| `staging` | 0 of 7 readable |
| `raw` | 0 of 4 readable |
| Write (an `INSERT` into `marts.situations`) | refused: read-only transaction |
| Sessions | read-only by default |

The live team pages kept rendering throughout, and a team page not loaded before the revoke rendered after it.

### Tables

| Table              | Source                         | Grain (one row per…)  | Primary key           | Seasons          |
| ------------------ | ------------------------------ | --------------------- | --------------------- | ---------------- |
| `raw.schedules`    | nflverse `load_schedules()`    | game                  | `game_id`             | 1999 to present  |
| `raw.teams`        | nflverse `load_teams()`        | team code             | `team_abbr`           | n/a              |
| `raw.game_weather` | Open-Meteo archive API         | game                  | `game_id`             | 2000 to present  |
| `raw.pbp`          | nflverse `load_pbp()`          | play                  | `(game_id, play_id)`  | 2016 to present  |

#### raw.schedules

Every game since 1999, regular season and playoffs, including scheduled games not yet played. `game_id` looks like `2017_14_IND_BUF` (season, week, away team, home team).

Idempotency proof (2026-10-16, local):

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

Weather at each game's stadium from Open-Meteo's historical archive (reanalysis models such as ERA5; see the note on amounts below). One row per finished game from 2000 on (1999 has no kickoff times) outside a fixed dome; retractable-roof games are included, since the open/closed state comes from schedules. Loaded by `pipeline/load_weather.py`; key `game_id`, stale rows deleted per `season`.

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

**The warehouse's buckets (temperature, precipitation, wind) use the game-window values**, which describe the conditions the game was played in. The kickoff-hour values are kept for comparison with nflverse's `temp` and `wind`.

**Closed-roof games have weather rows, but the warehouse treats them as having no weather.** The loader skips only fixed domes (by `stadiums.csv`), so retractable-roof stadiums get the outside weather for every game, whatever the roof did. As of 2026-10-17 (before the schedule corrections) the 5,945 rows broke down by schedules' per-game `roof`:

| Per-game `roof` | Rows | Weather applies? |
| --------------- | ---- | ---------------- |
| `outdoors` | 5,179 | Yes |
| `open` | 130 | Yes |
| `closed` | 629 | **No**: Houston, Arizona, Dallas, Indianapolis and Atlanta with the roof shut |
| `dome` | 7 | Depends: 6 Bills games at Toronto's Rogers Centre (2008–2013, a retractable roof kept shut): **no**. `2026_01_SF_LA` at the Melbourne Cricket Ground: **yes** |

The Melbourne game is an nflverse error: the MCG has no roof, but schedules list it as `dome` (the upcoming 2026 games in Munich and Paris carry the same placeholder). So the warehouse's rule is:

- **Weather applies when the game was effectively played in the open.** Use schedules' per-game `roof` (`outdoors` or `open`), except that a stadium `stadiums.csv` lists as `outdoors` always counts as open.
- **Every other game gets null weather buckets,** even though `raw.game_weather` has a row for it. They should neither count as "cold" or "windy" nor be dropped from other splits.

The 99% coverage check (`weather_coverage.sql`) uses this same rule. It counts 5,310 games (as of 2026-10-17): the 5,309 `outdoors` and `open` games plus the Melbourne game. The other 635 rows are closed-roof games. `test_mislabelled_open_air_game_has_weather` pins the Melbourne game, and `test_open_air_list_matches_seed` keeps the SQL's typed-in list of roofless stadiums in step with `stadiums.csv`.

**Amounts are model estimates, not gauge readings.** Open-Meteo's archive comes from reanalysis weather models that describe the atmosphere on a coarse grid (cells roughly 10–30 km across, depending on the model it blends). A grid cell averages out local squalls and narrow lake-effect snow bands. The 2017 Colts–Bills snow game shows only 0.99 in of snow over the game window, far below the lake-effect snow that buried the field. Temperature and wind, which vary smoothly, agree well with nflverse's reported values; precipitation and snow amounts are the least reliable. **The warehouse buckets precipitation and snowfall as none / light / heavy** (thresholds in `games`) rather than trusting exact amounts. Open-Meteo's `precipitation` includes melted snow, so in a snow game both totals are non-zero: call it snow when `snowfall_total_in` > 0, otherwise rain when `precipitation_total_in` > 0.

**Corrected kickoffs and venues.** The loader applies `transform/seeds/schedule_corrections.csv` before choosing hours and coordinates: 107 kickoff times nflverse lists wrongly (2000–05 night games at `09:00` instead of 21:00, five 2017–18 London games at `21:30` instead of 09:30) and 8 international games filed under the home team's US stadium (2025's seven, plus `2026_05_PHI_JAX`). The reload updated 93 rows and added the São Paulo game (previously skipped as SoFi's dome). On the 87 re-timed open-air games, agreement with nflverse's `temp` rose from r = 0.854 (mean gap −6.6 °F) to 0.973 (−2.1 °F). Six more kickoff times were added later. Five 2000 Colts and Cardinals home games were an hour early, because Indiana and Arizona skipped daylight saving time. `2016_02_TB_ARI` was listed at 13:00 instead of 16:05. Reloading 2000 and 2016 updated the 4 of them that have weather rows.

Checks at load (2026-10-16, local): 100% of finished outdoor and open-roof games from 2000 have weather (5,309 of 5,309; `pipeline/sql/checks/weather_coverage.sql`). Against nflverse's `temp` over 5,054 games: correlation 0.978, mean gap −0.3 °F, median absolute gap 1.9 °F (`weather_vs_nflverse_temp.sql`); 0.981 after the schedule corrections. The 2017 Colts–Bills snow game shows 0.25 in of snow in the kickoff hour and 0.99 in over the game window.

#### raw.pbp

Play-by-play from 2016, trimmed to 60 of nflverse's 372 columns (chosen and justified in `notebooks/01_pbp_columns.ipynb`). `play_id` is unique only within a game, so the key is the pair `(game_id, play_id)`. Loaded by `pipeline/load_pbp.py`, one season at a time; stale plays deleted per `season`.

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

**Size (2026-10-16, local):** 498,285 plays in 2,841 games, 2016 to 2026 week 6. 197 MB in total: 159 MB table, 33 MB primary key, 5 MB `(season, posteam)` index. Every `game_id` exists in `raw.schedules`.

## Staging layer

Built by dbt (`uv run python -m pipeline dbt build`) from `transform/models/staging/`. One view per raw table: views store nothing and always reflect the current raw data. Every later model reads staging, never `raw`.

| Model | Grain | Key | Rows (2026-10-17, local) | What it cleans |
| ----- | ----- | --- | ------------------------ | -------------- |
| `stg_schedules` | game | `game_id` | 7,548 | Applies `schedule_corrections`; `gameday` → date; `kickoff_et` (Eastern wall clock) and `kickoff_utc` (`AT TIME ZONE 'America/New_York'`); team codes → today's franchise, with `home_team_listed`/`away_team_listed` kept; 0/1 → boolean (`div_game`, `overtime`); `roof`/`surface` trimmed, blanks → NULL; nflverse's `temp`/`wind` renamed `nflverse_temp_f`/`nflverse_wind_mph`; lines as `numeric(4,1)` |
| `stg_teams` | current franchise | `team_abbr` | 32 | Drops OAK, SD, STL and LAR (mapped to LV, LAC, LA); `conference`, `division` |
| `stg_game_weather` | game | `game_id` | 5,946 | Integer casts; drops `_loaded_at` |
| `stg_pbp` | play | `(game_id, play_id)` | 498,285 | Team codes → today's franchise; `desc` → `play_description`; 0/1 flags stay small integers so `sum()`/`avg()` give counts and rates |

The macro `current_team(column)` maps a team code through `team_code_map`. 879 games carry an old code (OAK, SD or STL).

**Tests** (`transform/models/staging/_staging.yml`, `transform/tests/`): `unique` + `not_null` on every key (the custom generic test `unique_combination` for multi-column keys); `relationships` from schedule teams, play-by-play teams and `game_id`s, weather `game_id`s and corrected `stadium_id`s; `accepted_values` on `game_type`, `location`, `roof`, `conference`, `division` and `stg_pbp.season_type`; `not_null` on every column that is never NULL (e.g. week, rest days, team names, the weather loader's kickoff and game-window values). The seeds get the same: `not_null` on every `stadiums` column, `accepted_values` on its `roof`, and `relationships` from `team_code_map.current_code` to `stg_teams`. Singular tests:

- `stg_kickoff_matches_weather`: staging's `kickoff_utc` equals the weather loader's for every game with weather.
- `stg_no_early_kickoff_unless_neutral`: no non-neutral game kicks off before 09:30 ET (catches clock slips).
- `stg_no_early_local_kickoff`: no finished game at a team's own stadium kicks off before 11:30 local time. This catches times listed in local time instead of ET. On nflverse's uncorrected times it returns 104 games.
- `neutral_site_not_at_team_home`: no neutral-site game (Super Bowls exempt) is at the regular home stadium of either team playing (catches international games filed under a US stadium). On the uncorrected data it returns the 8 known games.

## Marts layer

Built by dbt from `transform/models/marts/` as tables (fast for the site to read, rebuilt on each run).

### dim_teams

One row per current franchise (32), key `team_abbr`: the teams the site lists and links to. A *dimension* table: it describes the teams, while the split marts hold the measurements and refer to teams by code. Built from `stg_teams`.

| Column | Meaning |
| ------ | ------- |
| `team_abbr` | Team code, e.g. BUF; the site's URL slug in lower case (`/teams/buf`) |
| `team_name`, `team_nick` | Buffalo Bills, Bills |
| `conference`, `division` | Today's alignment; division names sort into the league's usual order (East, North, South, West) |
| `team_color`, `team_color2` | Primary and secondary colours as upper-case hex. The primary is the badge and team-header colour, with white or near-black text chosen by contrast (`web/lib/team-colors.ts`, which checks at least 4.5:1 for all 32); the secondary is the header stripe |

**No logos or wordmarks.** `stg_teams` carries nflverse's logo URLs, but the site shows team colours and abbreviation badges instead, because NFL team logos are trademarks.

**Tests:** `unique`, `not_null` and `relationships` (to `stg_teams`) on `team_abbr`; `not_null` on every column; `accepted_values` on `conference` and `division`; singular `dim_teams_divisions`: 32 teams, 8 divisions of 4, every colour `#RRGGBB`.

**Neon (2026-10-19, Rob approved):** `dbt build --select dim_teams` created it with 32 rows, and all 12 tests passed. `web_reader` could read it at once with no new grant (`create_web_reader --check`: marts 8 of 8 readable), so the default privileges on `marts` work on Neon too. The live `/teams` page and all 32 team links were checked after the deploy.

### dim_stadiums

One row per stadium in the `stadiums` seed (69), key `stadium_id`: the home-field facts the team page's header shows. The seed lives in `staging`, which the website can't read. The site finds a team's home through `team_seasons` (its latest season's `home_stadium_id`).

| Column | Meaning |
| ------ | ------- |
| `stadium_name` | The current name. The seed adds a bracketed note to 14 names, either a former name ("Highmark Stadium (Ralph Wilson Stadium)") or which stadium is meant ("Tiger Stadium (LSU)"); `regexp_replace` removes it |
| `city`, `region`, `country` | The actual municipality, e.g. Orchard Park, New York, US |
| `timezone`, `altitude_m` | IANA zone and elevation in metres, as in the seed |
| `roof` | Physical roof: `outdoors`, `dome`, `retractable` |
| `surface`, `surface_type` | nflverse's surface term (e.g. `a_turf`) and grass/turf by the same rule as `games.surface_type` (dessograss counts as grass) |

**Tests:** `unique`, `not_null` and `relationships` (to the seed) on `stadium_id`; `not_null` on every column; `accepted_values` on `roof` and `surface_type`.

**Neon (2026-10-19, Rob approved):** `dbt build --select dim_stadiums team_records_match_official` created it with 69 rows. Its 14 tests passed, and so did the records test against Neon's data. `web_reader` read it at once through the default privileges (marts 9 of 9). After the deploy, all 32 live team pages rendered their season tables.

**Season records on the team page** come from `mart_team_splits`, not a separate mart: a team's `venue` rows add up to all its finished games (venue is never NULL), so summing them per season and season type gives the record. `team_records_match_official` (singular test) pins records checked against NFL.com and Wikipedia. `team_games` adds what the split marts can't: regular-season games still to play, and the round and result of each season's last playoff game.

### games

One row per game since 1999 (7,548 as of 2026-10-17), key `game_id`. Joins `stg_schedules` to `stadiums` and `stg_game_weather`, and buckets every game-level situation. Rules are in `docs/decisions.md` (2026-10-17).

| Column | Values (local counts, 2026-10-17) | Rule |
| ------ | ------ | ---- |
| `roof_type` | outdoors 5,513 · dome 1,236 · retractable_closed 635 · retractable_open 132 · NULL 32 | Stadium's physical roof; for retractable roofs, the game's own `open`/`outdoors` vs `closed`/`dome`. NULL = unknown (31 upcoming games, Madrid 2025) |
| `surface_type` | grass 4,375 · turf 3,173 | Game's surface, else the stadium's; `grass` and `dessograss` are grass |
| `is_open_air` | true 5,645 · false 1,903 | Game roof `outdoors`/`open`, or a roofless stadium. Weather columns are NULL when false |
| `temperature_f`, `wind_mph` | | Game-window mean temperature and max wind, rounded to whole numbers |
| `precipitation_in`, `snowfall_in` | | Game-window totals |
| `temperature_bucket` | 51_to_79 2,979 · 33_to_50 1,359 · 80_or_above 550 · 32_or_below 423 · NULL 2,237 | ≤32 / 33–50 / 51–79 / ≥80 °F |
| `wind_bucket` | under_10 3,305 · 10_to_14 1,473 · 15_plus 533 · NULL 2,237 | <10 / 10–14 / ≥15 mph |
| `precipitation_bucket` | none 4,432 · light_rain 532 · heavy_rain 201 · snow 146 · NULL 2,237 | snow if snowfall > 0; else heavy_rain ≥ 0.10 in, light_rain ≥ 0.01 in, else none |
| `time_slot` | sunday_early 3,804 · sunday_late 1,888 · mnf 472 · snf 457 · tnf 287 · saturday 252 · other 129 · NULL 259 | Eastern kickoff: Thu ≥19:00 tnf; Sun 12:00–15:59 early, 16:00–18:59 late, ≥19:00 snf; Mon ≥19:00 mnf; any Saturday; else other. NULL for 1999 |
| `is_primetime` | true 1,328 · false 5,961 · NULL 259 | Kickoff at 19:00 ET or later |
| `opponent_type` | divisional 2,831 · conference 2,814 · non_conference 1,903 | `div_game`; else same conference (Seattle AFC before 2002) |
| `is_neutral_site` | | `location = 'Neutral'` |

Weather buckets are NULL for closed-roof games, 1999, upcoming games and the last ~8 days of games (Open-Meteo's archive lag). An unplayed game at a retractable-roof stadium has no `roof_type` (open or closed is decided on game day), so it is also not open air; This week says so rather than showing weather.

**Tests:** `unique`/`not_null` on `game_id`; `accepted_values` on `game_type` and every bucket; `not_null` on every column that is never NULL (`season`, `week`, `gameday`, `is_finished`, rest days, `stadium_id` with `relationships` to `stadiums`, `surface_type`, `opponent_type`, `is_open_air`, `is_neutral_site`, …). Singular: every finished game has both scores, the overtime flag and both betting lines, and an unplayed game has no scores (`games_finished_complete`); row count equals `stg_schedules`; non-open-air games have no weather; open-air games with a weather row have all three weather buckets; the Melbourne game is open air with weather; every finished game has a roof type (except Madrid 2025); `div_game` matches today's divisions from 2002; nflverse's `weekday` matches `gameday`.

### team_seasons

One row per team per season (893 as of 2026-10-17), key `(team, season)`: the stadium the team called home, i.e. where it played most of its non-neutral home games that season (ties would go to the latest used). Columns: `home_stadium_id`, `home_stadium_name`, `home_timezone`, `home_latitude`, `home_longitude`, `home_games`. Only six team-seasons used more than one home stadium:
- The 2005 Saints after Hurricane Katrina: home is Baton Rouge, 4 games; they also played 3 in San Antonio and 1 at Giants Stadium.
- The Bills in 2009–12, with one Toronto game a year: home is Orchard Park.
- The 2010 Vikings: home is the Metrodome, with one game at TCF Bank Stadium after the roof fell in.

**Tests:** `unique_combination` on `(team, season)`; `not_null` on every column; `relationships` to `stg_teams` and `stadiums`.

### team_game_stats

One row per team per game with play-by-play (5,682 rows, 2,841 games, 2016 to 2026 week 6), key `(game_id, team)`. Built from `stg_pbp`: what the team's offense did, and what its defense allowed, which is simply the opponent's offense in the same game (a self-join). **Sums and counts only:** rates are computed over whatever games you pick, e.g. EPA/play = `sum(epa) / sum(dropbacks + rushes)`.

| Column | Rule |
| ------ | ---- |
| `plays`, `yards` | Box-score rules: pass, run (scrambles are runs), kneel and spike snaps; no penalty no-plays, no two-point tries. `yards` is total net yards (sacks subtract); yards/play = `yards / plays` |
| `dropbacks`, `rushes` | "Real" plays: nflverse's `pass` / `rush` flags with EPA known, no two-point tries. Leaves out kneels and spikes, keeps penalised snaps (their EPA includes the penalty). Pass rate = `dropbacks / (dropbacks + rushes)` |
| `epa`, `successes` | Summed over real plays; success rate = `successes / (dropbacks + rushes)` |
| `third_down_attempts`, `third_down_conversions` | nflverse's third-down flags |
| `red_zone_trips`, `red_zone_tds` | Drives with a snap (or field-goal try) from the opponent's 20 or closer; TDs = those drives ending in a touchdown. Extra points and two-point tries don't count |
| `sacks_taken`, `interceptions`, `fumbles_lost`, `turnovers` | Turnovers = interceptions thrown + fumbles lost. A lost fumble is charged to the receiving team on punts and to the intercepting team on interception returns, otherwise to `posteam`; on kickoffs `posteam` is the receiving team. Matches the play text's "RECOVERED by" on 99.7% of lost fumbles |
| `penalties`, `penalty_yards` | Accepted penalties charged to this team, on any play |
| `def_plays`, `def_yards`, `def_dropbacks`, `def_rushes`, `def_epa`, `def_successes`, `sacks`, `takeaways` | The opponent's `plays`, `yards`, `dropbacks`, `rushes`, `epa`, `successes`, `sacks_taken`, `turnovers` |

**Checked against official box scores** (ESPN team stats):
- Super Bowl LVII matches on every figure: plays 53/72, yards 340/417, 3rd down 4-8/11-18, red zone 4-5/3-5, penalties 3-14/6-33, sacks 0/2, turnovers 0/1.
- Seattle at Pittsburgh on 2025-09-14 matches on every figure but one. Pittsburgh's plays are 58 against ESPN's 59, because nflverse files Rodgers' intentional grounding as `no_play` while the box score counts it as a pass attempt. 24 plays since 2016 are filed that way; yards are unaffected.

League rates come out as expected: 5.3–5.6 yards per play, EPA/play near 0, success rate about 0.44, 2020 the highest-scoring season.

**Tests:**
- `unique_combination` on `(game_id, team)`; `not_null` on every column (a team with no penalties has 0, not NULL); `relationships` to `games` and `stg_teams`.
- Singular:
  - Both box scores above.
  - Exactly two rows per game with play-by-play, each row's defense equal to the other row's offense.
  - Interceptions, lost fumbles, sacks and penalties reconcile with `stg_pbp`'s totals, so nothing is dropped or double-charged.

### team_games

Two rows per game (15,096 as of 2026-10-17), key `(game_id, team)`: each game from each team's point of view. Built from `games` with `UNION ALL` (a home branch and an away branch), then joined back to `games` for every game-level situation column above, so the splits marts read one table. Travel columns come from `team_seasons` (the team's home) and `stadiums` (the venue).

| Column | Values (local counts) | Rule |
| ------ | ------ | ---- |
| `team`, `opponent`, `is_home` | | `is_home` is the designated home team, even at a neutral site |
| `season_type` | REG 14,478 · POST 618 | `POST` when `is_playoff` |
| `venue` | home 7,445 · away 7,445 · neutral 206 | neutral when `is_neutral_site` |
| `points_for`, `points_against`, `margin` | | From this team's side; NULL until played |
| `result` | win 7,340 · loss 7,340 · tie 32 · NULL 384 | |
| `rest_days`, `rest_diff` | | nflverse's days since the previous game (week 1 = 7); `rest_diff` = team minus opponent |
| `rest_bucket` | normal 12,669 · bye 1,053 · extra 726 · short 648 | ≤5 short, 6–8 normal, 9–12 extra, ≥13 bye |
| `rest_advantage` | even 12,126 · less_rest 1,485 · more_rest 1,485 | From `rest_diff` (Rob's choice): −3 or less `less_rest`, +3 or more `more_rest`, else `even` (a 1–2 day gap, e.g. a Monday-night team against a Sunday team, is even). One side's `less_rest` is the other's `more_rest` |
| `team_spread` | | Betting convention, negative = favourite: home `−spread_line`, away `+spread_line` |
| `spread_role` | favourite 3,645 · underdog 3,645 · pickem 3,018 · big_favourite 2,228 · big_underdog 2,228 · NULL 332 | ≤−7 big_favourite, −6.5 to −3 favourite, under 3 either way pickem, +3 to +6.5 underdog, ≥+7 big_underdog |
| `ats_result` | cover 7,155 · no_cover 7,155 · push 402 · NULL 384 | Against the spread: `margin + team_spread` > 0 cover, = 0 push, < 0 no_cover. NULL until played (every finished game has a line). Covers and non-covers match, because one team's cover is the other's miss |
| `total_line`, `total_result` | over 7,170 · under 7,330 · push 212 · NULL 384 | Both teams' points against the total line; the same on both rows (counts are team-games, so twice the games) |
| `home_stadium_id` | | This team's home that season (`team_seasons`) |
| `travel_miles` | 0 to 7,929 | Great-circle (haversine) miles from the home stadium to the game's stadium. 0 at the team's own stadium, including the Jets' and Chargers' 10 "away" games at the stadium they share with the Giants and Rams |
| `time_zone_shift` | −7 to +9 | Hours the venue's clock is ahead of the team's home clock at kickoff (+ = travelled east), from IANA zones, so daylight saving time is handled; wrapped into −12..+12 (LA→Melbourne, +17, is −7). 1999 has no kickoff times, so it uses 1 pm ET on the game day |
| `time_zone_travel` | none 10,530 · eastbound_1_3 2,231 · westbound_1_3 2,222 · long_haul_4_plus 113 | 0 none; +1 to +3 eastbound; −1 to −3 westbound; 4+ either way long haul (almost all trips to Europe) |
| `body_clock_time` | | Kickoff on the team's home clock (Seattle at 1 pm ET: 10:00). Every row: for the home team it's local time. NULL in 1999 |
| `body_clock` | afternoon 9,548 · night 2,125 · late_afternoon 2,085 · morning 820 · NULL 518 | Before 12:00 morning; 12:00–15:59 afternoon; 16:00–18:59 late_afternoon; 19:00 or later night |
| `plays` … `takeaways` | | Every `team_game_stats` column, left-joined: NULL before 2016 and for games not yet played |
| `game_number` | 1 to 21 | The team's nth game of the season, playoffs included (`ROW_NUMBER`) |
| `prev_result` | win 7,109 · loss 6,710 · tie 32 · NULL 1,245 | The team's previous game this season (`LAG`); NULL in game 1 or if that game isn't played yet |
| `streak` | −15 to +18 | Run of identical results entering the game: +3 = won the last three, −2 = lost the last two, 0 after a tie, NULL with `prev_result`. The 2007 Patriots entered Super Bowl XLII at +18 |
| `after_blowout_loss` | true 1,789 · false 12,062 · NULL 1,245 | The previous game this season was lost by 17+ points (three scores) |
| `games_since_bye` | 0 to 17 | Games since the team last rested: a bye (13+ days off, playoff byes included) or the season start. 0 in week 1 and the first game back |
| `consecutive_road_games` | 0 7,445 · 1 5,414 · 2 2,034 · 3+ 203 | Road games in a row, this one included; 0 at home. A neutral site is a road game (the 2020 49ers' Glendale games make the only 7) |

**The situation explorer reads it directly.** Combining situations needs one row per team-game, which the split marts (one situation per row) can't give, so the explorer filters `team_games` with registry columns and bound values. It counts how many of each game's two rows matched: one (only one team was in the situation, read from its side) or two (both were, counted once). 15,096 rows and 6.8 MB, so the full scan takes milliseconds and needs no index.

**Form features describe the team entering the game.** Each is built from earlier games' results plus this game's schedule (rest days, venue), never from this game's own result:
- Results are read with `LAG`, which looks one game back.
- The two running counts (`games_since_bye`, `consecutive_road_games`) include the current row, but they read only schedule columns, which are known before kickoff.
- The sequence restarts each season (week 1 has no previous game) and runs on through the playoffs.

This matters for projections: a prediction can only use what was known before kickoff. A feature that had seen the game's result would leak the answer into the model, and walk-forward backtests would then look far better than any real prediction could be. The same rule makes these columns safe to use as situations ("after a blowout loss").

**Tests:**
- `unique_combination` on `(game_id, team)`.
- `not_null` and `relationships` on `game_id`, `team` and `home_stadium_id`; `not_null` on every column that is never NULL: identity, `is_finished`, rest, `travel_miles`, `time_zone_shift`, `stadium_id`, `surface_type`, `is_open_air`, `opponent_type` and the form counts.
- `accepted_values` on `season_type`, `venue`, `result`, `rest_bucket`, `rest_advantage`, `spread_role`, `ats_result`, `total_result`, `time_zone_travel`, `body_clock`.
- Singular:
  - Exactly two rows per game (the check).
  - The two rows mirror each other: opponents, points, home flag, and spread, rest and margin differences cancel; one side's `less_rest` is the other's `more_rest`.
  - Super Bowl LVII's spread sign: PHI −1, KC +1, KC won by 3 and covered (`cover` / `no_cover`); 73 points against a total of 51 is `over` on both rows.
  - Breaking the away spread's sign or dropping the away rows makes these fail.
- Travel spot checks:
  - Seattle at Pittsburgh at 1 pm ET: 10:00 body clock, +3, 2,132 miles.
  - Arizona and the Rams: 0 zones in October, ±1 in December.
  - Melbourne: −7.
  - No team at its own stadium has travelled.
- Form:
  - The 2024 Eagles' 21 games pinned row by row: the São Paulo opener as a road game, the 17-point loss at Tampa Bay feeding the first game after the bye, and the 10-game streak ended by Washington.
  - The streak's sign always agrees with `prev_result`.
  - `accepted_values` on `prev_result`; `not_null` on `game_number`, `games_since_bye`, `consecutive_road_games`.

### mart_team_splits

A team's record in every situation value, per season and season type: one row per `(team, season, season_type, situation_key, situation_value)`, e.g. `BUF, 2024, REG, wind, 15_plus`. 40,552 rows (7.0 MB) as of 2026-10-18 (including rest advantage), 1999 to 2026 week 6, finished games only.

**How it's built.** Each finished `team_games` row is unpivoted into one row per situation in the registry (`CROSS JOIN LATERAL (VALUES …)`, generated from `marts.situations`), holding the situation's key, its `level` and this game's value as text (`true`/`false` for primetime). A NULL value drops out of that situation only: a closed-roof game has no weather row but still counts under roof, venue and the rest. Then `GROUP BY` the five grain columns. A new situation in `situations.csv` appears here on the next build with no SQL change.

**Sums and counts only, never averages.** Every rate is computed when it's read, over whatever rows are picked: win % for 2022–2024 is the three seasons' summed wins and ties over their summed games. Averaging three seasons' win %s would weigh a short sample the same as a long one. Summing a situation's values gives the team's totals for every game that has a value; `venue` is never NULL, so the `venue` rows add up to all the team's games.

| Column | Meaning | Rates built from it |
| ------ | ------- | ------------------- |
| `team`, `season`, `season_type`, `situation_key`, `situation_value` | The grain. `season_type` is `REG` or `POST` | |
| `situation_level` | `game` or `team`, from the registry. Fixed by the key | |
| `games`, `wins`, `losses`, `ties` | Finished team-games | Win % = (`wins` + ½ × `ties`) / `games`, the NFL standings definition |
| `points_for`, `points_against` | Summed points | Points per game; margin = `points_for − points_against` |
| `margin_sq`, `total_points_sq` | Σ margin² and Σ (points_for + points_against)² over the games | Standard deviations, exact over any range: SD = √((Σx² − n·mean²)/(n − 1)), with n = `games` and mean = summed margin (or total) / n. In the league mart a game-level value counts each game twice, so halve the sums and n before computing an interval |
| `ats_games`, `ats_covers`, `ats_pushes` | Games with a line, covers, pushes | Cover % = `ats_covers / (ats_games − ats_pushes)` |
| `ou_games`, `overs`, `unders`, `ou_pushes` | Games with a total, and their results | Over % = `overs / (ou_games − ou_pushes)` |
| `stats_games` | Games with play-by-play (2016 on); 0 before | Per-game stats divide by this, not `games` |
| `plays`, `yards`, `dropbacks`, `rushes`, `epa`, `successes` | Offense, summed from `team_game_stats` | Yards/play = `yards / plays`; EPA/play = `epa / (dropbacks + rushes)`; success rate likewise; pass rate = `dropbacks / (dropbacks + rushes)` |
| `def_plays`, `def_yards`, `def_dropbacks`, `def_rushes`, `def_epa`, `def_successes` | Defense (the opponents' offense) | The same rates, allowed |
| `turnovers`, `takeaways`, `sacks`, `sacks_taken` | | Turnover margin = `takeaways − turnovers` |
| `third_down_attempts`, `third_down_conversions`, `red_zone_trips`, `red_zone_tds`, `penalties`, `penalty_yards` | | 3rd-down %, red-zone TD %, penalties per game |

The play-by-play sums are NULL (not 0) when `stats_games` is 0: no data, not zero plays. `SUM` skips NULLs, so a 2014–2017 range adds the 2016–17 stats and divides by their `stats_games`. Counts and integer sums are `integer` (the site's `pg` driver returns `bigint` as a string); `epa` and `def_epa` are `double precision`.

**Tests:** `unique_combination` on the grain; `not_null` on the grain and every count (games through `stats_games`; the play-by-play sums may be NULL); `relationships` from `team` to `stg_teams` and from `situation_key` to `situations`; `accepted_values` on `season_type` and `situation_level`. Singular tests below, with the league mart.

### mart_league_splits

The whole league per season, season type and situation value: `mart_team_splits` summed over the 32 teams, with the same columns minus `team`. 2,457 rows (0.5 MB) as of 2026-10-18. Its numbers are the teams' numbers added up, nothing recomputed: that's what additive measures buy.

**`games` counts team-games:** a 15+ mph wind game adds two, one per team. So:
- **League win % is meaningful only for team-level situations** (`situation_level = 'team'`: venue, rest, rest advantage, time-zone travel, body clock, spread role). In a game-level situation both teams share the value, so one wins and one loses and the league is 50% by construction. Compare game-level situations on scoring and over/under rate instead. The same holds for any team-level value both teams share: venue's `neutral`, rest advantage's `even`, spread role's `pickem`, and in practice rest's `short` (both teams in 300 of 309 games). (Also under `situations.csv` below.)
- League over/under counts are twice the games, and so are the points. Rates are unaffected.

**Norms for the explorer.** The `venue` rows hold every finished game, so they give the league's win % and margin per season and venue (the venue norm for one-sided games) and its points per game and over % per season (the season norm for shared games).

**Neon refresh for This week (2026-10-19, Rob approved).** Neon's raw data stopped at 2026-10-15. `ingest` (current season) then `dbt build`, each with `DATABASE_URL` set to Neon for that one command: schedules 27 updated, weather 10 inserted, play-by-play 2,181 inserted, the same as the local refresh; 332 of 332 passed, including `featured_effects_match_findings`. `create_web_reader --check`: marts 9 of 9 readable, staging and raw 0, writes refused. The live `/this-week` then showed week 6 with Monday night's game still to play, and `this_week_situations.sql` found 0 rest-day differences on Neon.

**Featured effects for This week.** Per-season sums give the season-adjusted total: each game's total minus its season's average game. With n games, Σx their totals and m the season mean, a season's deviations sum to Σx − n·m (and their squares to Σx² − 2m·Σx + n·m²), which add across seasons. `featured_effects_match_findings` pins the results to `docs/findings.md`: heavy rain −5.1, light rain −2.8, snow −1.2, 15+ mph wind −3.8, 10–14 mph −1.9, dome +2.8, 3+ days less rest 48.4% and −1.0.

**League home win % by season** (regular season, `venue = 'home'`, a pinned check):

| Seasons | Home win % |
| ------- | ---------- |
| 1999–2018 | .531 (2006) to .616 (2003) |
| 2019 | .520 |
| **2020** | **.504**, the lowest: mostly empty stadiums |
| 2021 | .511 |
| 2022–2025 | .524 to .566 |

**2020 reconciliation.** The published 2020 home record is 127–128–1 (.498) in 256 games. Here `home` holds 253 games, 127–125–1 (.504). The other 3 are the 49ers' "home" games in Glendale, Arizona (weeks 13, 14 and 17, all losses), played there under Santa Clara County's COVID rules. nflverse lists them as neutral-site games, so they're under `neutral`. Adding SF's `neutral` row (0–3, from `mart_team_splits`) gives back 256 games at 127–128–1 = .498. Those are 2020's only neutral-site regular-season games, so the league's `neutral` row is 6 team-games, 3–3.

**Tests:**
- `unique_combination` on `(season, season_type, situation_key, situation_value)`; `not_null` on the grain and `games`; `relationships` and `accepted_values` as in the team mart.
- `mart_splits_additive`: every measure equals the sum over teams (columns read from the database, so new measures are covered).
- `mart_splits_cover_every_game`: for each situation, season and season type, the league's games, wins, ties, points and plays over all values equal the finished `team_games` rows with a value, counted directly. Generated from the registry.
- `league_splits_2020_home_dip`: 2020 has the lowest regular-season home win % of every complete season (any season whose regular season is fully played).
- `splits_2020_home_record`: pins the reconciliation: home 253 games 127–125–1, neutral 6 at 3–3, SF neutral 0–3.
- `mart_splits_counts_consistent`, on both marts: wins + losses + ties = games; covers and pushes fit inside `ats_games`; overs + unders + pushes = `ou_games`; `stats_games` ≤ games; the play-by-play sums are NULL exactly when `stats_games` is 0; and games × `margin_sq` ≥ (summed margin)², the same for totals, because a variance can't be negative (in `bigint`: the product reaches about 435 million).
- Adding a game to one league row fails the first two; lowering 2019's home wins fails the dip test.

## Documentation

Every model, seed and column in `staging` and `marts` has a description: 391 columns. They live in the YAML files beside the models (`_staging.yml`, `_marts.yml`). A column shared by several models (`game_id`, `plays`, `epa`, …) is described once, in a docs block in `transform/models/_docs.md`, and referenced with `{{ doc('plays') }}`, so the four marts that carry the play-by-play stats say the same thing.

- **In the database.** `+persist_docs` (`transform/dbt_project.yml`) writes each description into Postgres as a `COMMENT` on the table, view or column every time dbt builds it. DBeaver shows them in a table's Properties and Columns tabs, and `\d+ marts.mart_team_splits` shows them in psql.
- **As a website.** `uv run python -m pipeline dbt docs generate` writes `transform/target/` (the manifest of every model and test, plus a catalog of real column types read from the database). The `dbt-docs` entry in `.claude/launch.json` serves it at http://localhost:8080: model pages with columns, types, descriptions and tests (N not_null, U unique, A accepted_values, F relationships), the SQL, and the lineage graph (the button at the bottom right).
- **Lineage.** The graph draws every `ref()` and `source()`: raw tables → staging views (and seeds) → `games`, `team_seasons`, `team_game_stats` → `team_games` (+ `situations`) → `mart_team_splits` → `mart_league_splits`.

## Seeds

**Adding a column to a seed** needs a rebuild, `uv run python -m pipeline dbt build --full-refresh --select <seed>`: a plain `dbt seed` truncates and re-inserts into the existing table, which fails when the columns change.

Hand-made reference CSVs in `transform/seeds/`, loaded by `dbt seed` (`uv run python -m pipeline dbt seed`) into the `staging` schema, e.g. `staging.stadiums`. The exception is `situations`, which the website reads, so it loads into `marts`.

| Seed                | Grain                | Key           | Purpose                                                         |
| ------------------- | -------------------- | ------------- | --------------------------------------------------------------- |
| `stadiums.csv`      | stadium              | `stadium_id`  | Coordinates, IANA time zone, altitude, roof and surface   |
| `team_code_map.csv` | old team code        | `old_code`    | Maps relocated teams' codes to today's code, e.g. OAK→LV  |
| `schedule_corrections.csv` | game × column | `(game_id, column_name)` | Fixes for values nflverse publishes wrongly: kickoff times, venues, roofs |
| `situations.csv` | situation | `key` | The situation registry: what the site can filter on and the split marts group by |

### stadiums.csv

One row per `stadium_id` used in `raw.schedules` (67 as of 2026), plus venues reached only through `schedule_corrections.csv` (Croke Park `DUB00`, Berlin's Olympiastadion `BER00`): 69. Columns:

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

nflverse lists several 2026 international games with placeholder roofs: Melbourne Cricket Ground (played in week 1), Allianz Arena and Stade de France as `dome`, and the Bernabeu blank. The CSV records their real roof types; see the warehouse's weather rule under `raw.game_weather`.

### situations.csv

The situation registry, in `marts.situations`. One row per filter: the 12 situations planned for v1, with time slot's primetime flag as its own row (13), plus rest advantage (14). The findings trimmed surface, primetime and opponent type on evidence (`docs/findings.md`): they keep their rows, columns and split-mart data, with `in_v1` false, so 11 rows are in v1. The website builds its filters from this table, and the split marts generate their SQL from it, so a new situation is a new CSV row (plus its `team_games` column), with no new page code.

| Column | Meaning |
| ------ | ------- |
| `key` | Situation id, e.g. `wind` |
| `label` | Display name, e.g. "Time-zone travel" |
| `category` | Filter group: venue, stadium, weather, schedule, travel, matchup |
| `level` | `game`: the same for both teams (roof, surface, temperature, precipitation, wind, time_slot, primetime, opponent_type). `team`: can differ between them (venue, rest, rest_advantage, time_zone_travel, body_clock, spread_role) |
| `column_name` | The `team_games` column holding the value. `column` is an SQL keyword |
| `value_list` | Its values in display order, separated by `\|`. `values` is an SQL keyword |
| `description` | One sentence for the site |
| `in_v1` | Shown in v1. `false` for the three situations the findings trimmed, and for later additions not yet shown |
| `tier` | How the site groups a v1 situation: `featured` (precipitation, wind, roof, rest advantage), `filter` (temperature, time slot, time-zone travel, body clock, rest) or `context` (venue, spread role). NULL exactly when `in_v1` is false |
| `sort_order` | Display order, 1 first |
| `value_labels` | Display labels for `value_list`, same order, separated by `\|`, e.g. `Under 10 mph\|10–14 mph\|15+ mph` |
| `shared_values` | Team-level values both teams usually share, separated by `\|`: venue `neutral`, rest advantage `even`, spread role `pickem`, rest `short`. The site shows no league win % or margin for them. NULL when none |
| `shrinkage_k` | Shrinkage strength in games from notebook 06 (persistence method): a team's own split gets weight n / (n + k) in the shrunk win %. 119 (body clock) to 673 (rest advantage). The notebook asserts that each value matches its estimate |

**League win % is only meaningful for team-level situations.** In a game-level situation both teams share the value: in a 15+ mph wind game, one team wins and the other loses, so the league's win % in wind is 50% by construction. Compare game-level situations on scoring (points per game, total points) and over/under rate instead. The same holds for any team-level value both teams share: venue's `neutral`, rest advantage's `even` and spread role's `pickem`.

**Tests:**
- `unique` key and column; `accepted_values` on `category` and `level`.
- Singular:
  - The registry holds exactly the 14 expected keys with the expected `in_v1` flags (11 in v1), and each `column_name` exists in `team_games` (via `information_schema.columns`): the registry check, updated when rest advantage was added.
  - Each `value_list` equals the values its column takes, both ways.
  - Every game-level column has the same value on both rows of each game. Mislabelling `venue` as `game` would flag all 7,445 non-neutral games.
  - `situations_display_columns`: `tier` is set exactly when `in_v1`; one label per value; `shared_values` only on team-level rows and only from `value_list`; `shrinkage_k` positive. `sort_order` is `unique` and `not_null`.
- The last two are generated by looping over the registry (`situation_registry()` macro), so they grow with it.

**Neon (2026-10-19, Rob approved each step).** The registry's new columns and the split marts' sums of squares went to production by expand → deploy:
1. `dbt build --full-refresh --select situations`, then the full `dbt build`, each with `DATABASE_URL` set to Neon for that one command: 25 of 25, then 331 of 331 passed.
2. `create_web_reader --check`: marts 9 of 9 readable, staging and raw 0, writes refused. Read as `web_reader`, Neon matched local: 11 situations with a tier, rest advantage's k = 673, Las Vegas 2–0 in light rain over 2023–2025, and the league's venue sums of squares (3,204,596 and 31,799,164).
3. The live site kept rendering on the old code until the splits-table code was pushed and deployed. `/teams/lv?from=2023&to=2025` reads light rain 2–0, shrunk 29.6% with k = 120, as in notebook 06, and all 32 live team pages render their splits at the default range and at 2016–2025 with the playoffs (where the 2020 note appears).
