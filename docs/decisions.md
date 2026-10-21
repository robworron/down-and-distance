# Decision record

The project's technical decisions and the reasons for them, grouped by area and dated when each was made. Where this record and `docs/build-plan.md` disagree, this record wins.

## Working method

### 2026-10-16 — Claude Code writes the SQL checks and solutions

- **Changed:** Done-when SQL checks and the solutions to exercise steps are no longer handed back to Rob. Claude Code writes them with clause-by-clause comments, and walks through them after the check passes. `CLAUDE.md` is updated to match.
- **Why:** Rob would rather keep the build moving and learn query-building afterwards from finished, working, commented queries.

### 2026-10-17 — Claude Code writes all code

- **Changed:** Claude Code writes all code, including SQL, statistics and analysis, and walks Rob through each SQL- or analysis-heavy step clause by clause afterwards. No step is set as an exercise for Rob. Judgment calls the plan doesn't settle (bucket definitions, data corrections, scope changes) are a hand-back: options with counts and a recommendation. `pipeline/sql/checks` are simply "SQL checks". Reconfirmed by Rob on 2026-10-21.
- **Why:** Rob would rather keep the build moving and be able to explain finished, working code in interviews. This completes the 2026-10-16 change.

## Environment and tooling

### 2026-10-15 — Python 3.13, not the latest

- **Changed:** the project is pinned to Python 3.13 in `.python-version` (`requires-python = ">=3.13"`), although 3.14 was installed globally.
- **Why:** dbt Core typically lags new Python releases. Pinning now avoids rebuilding the environment later.

### 2026-10-15 — pandas and pyarrow added

- **Changed:** `pandas` and `pyarrow` were added to the dependencies, which the first setup didn't include.
- **Why:** writing a dataframe to Postgres through SQLAlchemy goes via pandas, and pyarrow makes the Polars-to-pandas conversion fast. Both would have arrived with the analysis notebooks anyway.

### 2026-10-16 — Postgres 18, not 17

- **Changed:** local Docker runs `postgres:18`, and the volume is mounted at `/var/lib/postgresql`, the layout the 18 image expects.
- **Why:** local and production should run the same major version, and the Neon project was created on Postgres 18. The local volume was recreated, and only the reloadable 2025 schedule was lost.

### 2026-10-16 — Local host port 15432

- **Changed:** `docker-compose.yml` maps host port `15432` to the container's 5432. Local `DATABASE_URL` and DBeaver use 15432.
- **Why:** after a Windows restart, WinNAT reserved TCP 5427–5526, which blocks both 5432 and the usual fallback, 5433. 15432 sits outside the reserved ranges. Freeing the range would mean changing a Windows networking service.

### 2026-10-16 — pandas instead of Polars

- **Changed:** all project code uses pandas. nflreadpy's Polars output is converted with `.to_pandas()` immediately after loading. Polars was removed as a direct dependency and stays installed only because nflreadpy needs it. The schedule loader now writes with `DataFrame.to_sql`.
- **Why:** pandas is the industry standard for analyst work, and it's what Rob can explain in interviews.

### 2026-10-17 — dbt runs through a wrapper; exact schema names

- **Changed:** dbt-core 1.12 and dbt-postgres 1.11 (both pinned below 2.0, which is still a release candidate). `dbt_project.yml` was written by hand instead of `dbt init`, which would have nested a second project folder inside `transform/`. `transform/profiles.yml` is committed with no secrets: it reads `DBT_HOST`, `DBT_PORT`, `DBT_USER`, `DBT_PASSWORD`, `DBT_DBNAME` and `DBT_SSLMODE`, which `uv run python -m pipeline dbt …` (`pipeline/run_dbt.py`) fills in from `DATABASE_URL`. A `generate_schema_name` macro makes models land in exactly `staging` and `marts`, not dbt's default `staging_marts`-style names. Anonymous usage stats are off.
- **Why:** `DATABASE_URL` stays the single switch between local and Neon for both the pipeline and dbt, and the passwords never get copied into a second set of variables.

### 2026-10-17 — Seeds load into the staging schema

- **Changed:** `dbt seed` loads `stadiums` and `team_code_map` into `staging` (e.g. `staging.stadiums`), not a schema of their own.
- **Why:** it keeps the database to the three documented schemas (`raw`, `staging`, `marts`). Seeds are cleaned reference data that staging and marts join to. A seed the website must read (e.g. `situations.csv`) can set its own `+schema: marts`.

## Ingestion

### 2026-10-16 — 2022 has 271 regular-season games

- **Changed:** the 1.2 check expects 272 regular-season games from 2021, except **271 in 2022**.
- **Why:** the Week 17 Bills–Bengals game was cancelled after Damar Hamlin's cardiac arrest and never replayed. nflverse correctly omits it.

### 2026-10-16 — raw.schedules recreated with a primary key

- **Changed:** the first `raw.schedules` (no primary key, types inferred from 2025 alone) was dropped and rebuilt from 1999–2026 with `game_id` as its primary key. Neon's copy was rebuilt the same way in its first production load.
- **Why:** upserts need a primary key, and types inferred from one season can be wrong for others. The table is fully reloadable from nflverse.

### 2026-10-16 — Upserts also delete stale rows, per season

- **Changed:** `upsert_dataframe` in `pipeline/db.py` deletes rows in the seasons being loaded whose key is no longer in the source, and logs the count. This applies to `raw.schedules`, `raw.game_weather` and `raw.pbp`; `raw.teams` is upsert-only. A requested season that arrives with no rows raises an error rather than being wiped.
- **Why:** a plain upsert never removes anything, so a cancelled game or a play nflverse deletes would linger in `raw` forever. Scoping the delete to the loaded seasons keeps a current-season-only run from touching history.

### 2026-10-16 — Integer columns stay integers when they contain nulls

- **Changed:** loaders convert nflverse data with `nflverse_to_pandas` (`pipeline/db.py`), which maps every Arrow integer type to pandas' nullable `Int64`, instead of a bare `.to_pandas()`. Those columns are `bigint` in Postgres.
- **Why:** pandas' default turns an integer column with nulls (e.g. scores of unplayed games) into float64, so scores would be stored as 24.0.

### 2026-10-16 — stadiums.csv: region column and physical roof type

- **Changed:** `stadiums.csv` has a `region` (state/province) column, and its `roof` column holds the stadium's physical roof type (`outdoors` / `dome` / `retractable`) rather than the most common per-game value from schedules. `requests` was added as a dependency and `timezonefinder` as a dev dependency.
- **Why:** `region` lets the geocoding check tell Arlington, TX from Arlington, VA. Per-game roof values describe a game's state (`open` / `closed`) and include wrong placeholders for upcoming 2026 international games; the seed describes the building.
- **Verified 2026-10-17:** every open-air international venue is `outdoors` in the seed: the Melbourne Cricket Ground, Allianz Arena (both `GER00` and `MUN01`), Stade de France, Wembley, Twickenham, Tottenham, Azteca, Maracanã and Arena Corinthians. Rogers Centre, Deutsche Bank Park and the Bernabéu are `retractable`. Across all 67 stadiums, nflverse's per-game roof contradicts the seed only for MEL00, MUN01 and PAR00, which it lists as `dome`. No corrections were needed.

### 2026-10-16 — Weather: no 1999, and game-window values

- **Changed:** `raw.game_weather` starts in 2000, because nflverse has no kickoff time for any 1999 game. The 99% coverage check covers games with a known kickoff time. Beside the kickoff-hour values, each game also stores game-window values from kickoff to kickoff + 3 hours: average temperature, maximum wind and gusts, and total precipitation and snowfall. Weather is skipped for fixed domes, using `stadiums.csv`'s physical roof type.
- **Why:** an hour can't be matched without a kickoff time. A single kickoff-hour reading misses rain or snow that starts mid-game, so the warehouse's weather buckets use the window values.
- **Also:** the kickoff hour is the nearest UTC hour with half-hours rounding *up*. pandas' `.dt.round` rounds exact half-hours to the nearest even hour, which rounded 149 kickoffs down (mostly 8:30 pm ET night games during daylight saving time) and others up. The first full load used it; the fix reloaded those 149 games from the cache.

### 2026-10-16 — raw.pbp stores whole-number columns as integers

- **Changed:** the 41 play-by-play columns that nflverse publishes as decimals but that only hold whole numbers (0/1 flags, down, yards, clock, `play_id`) are stored as `smallint` (`play_id` as `integer`) rather than `double precision`. The loader refuses any value that isn't whole or doesn't fit.
- **Why:** measured on 2025, it cuts `raw.pbp` from about 330 MB to about 205 MB for 11 seasons, with identical values (checked for every season 2016–2026). Rob chose this over strict as-is types at the 1.7a review.

### 2026-10-16 — No separate game_id index on raw.pbp

- **Changed:** `raw.pbp` has an index on `(season, posteam)` and no separate index on `game_id`.
- **Why:** the primary key `(game_id, play_id)` is already a B-tree index led by `game_id`, and `EXPLAIN` confirms that a `WHERE game_id = …` query uses it. A second index would cost about 15 MB of Neon storage for nothing.

### 2026-10-17 — Weather coverage counts games played in the open

- **Changed:** the coverage check (`pipeline/sql/checks/weather_coverage.sql`, run by `test_weather_coverage`) counts a game when its own roof in schedules is `outdoors`/`open` **or** its stadium has no roof in `stadiums.csv`. Before, it trusted schedules' roof alone. It now covers 5,310 games, all with weather. `stadiums.csv` wasn't in the database before the warehouse was built, so the SQL types in its 47 roofless stadiums, and `test_open_air_list_matches_seed` fails if that list drifts from the CSV. `test_mislabelled_open_air_game_has_weather` checks the Melbourne game directly.
- **Why:** nflverse lists the 2026 Melbourne Cricket Ground game as `dome`, although the MCG has no roof, so the old rule silently left a real open-air game unchecked. Munich and Paris carry the same label for games not yet played. This matches the warehouse's rule (see `docs/data-model.md`, `raw.game_weather`): closed-roof games get no weather; roofless stadiums always do.

### 2026-10-17 — Weather rules for the warehouse

- **Changed:** the weather situations in `games` follow three rules, detailed in `docs/data-model.md` under `raw.game_weather`:
  1. Buckets use the **game-window** values (kickoff to kickoff + 3 h), not the kickoff hour.
  2. Weather applies only to games **played in the open**: the game's roof in schedules is `outdoors`/`open`, or `stadiums.csv` says the stadium has no roof. Closed-roof games (629, plus 6 at Toronto's Rogers Centre) get null weather buckets, although `raw.game_weather` has rows for them.
  3. Precipitation and snowfall are bucketed **none / light / heavy**, with thresholds chosen when `games` was built, rather than used as exact amounts. Snow when `snowfall_total_in` > 0, otherwise rain when `precipitation_total_in` > 0. This refines a plain none / rain / snow split with an intensity; the final value set is in the game-level buckets entry.
- **Why:** retractable-roof stadiums get weather rows whatever the roof did, and nflverse mislabels some roofless venues as `dome`. Open-Meteo's amounts come from models on a grid roughly 10–30 km across, which smooths out local squalls: the 2017 Buffalo snow game shows only 0.99 in. Temperature and wind agree well with nflverse (r = 0.978), so they can be bucketed as planned.

## Warehouse (dbt)

### 2026-10-17 — Schedule corrections: kickoff times and international venues

- **Changed:** `transform/seeds/schedule_corrections.csv` (key `game_id` + `column_name`; columns `nflverse_value`, `corrected_value`, `note`) fixes 118 values nflverse publishes wrongly. `stg_schedules` applies it in SQL and the weather loader applies it in Python (`pipeline/corrections.py`), so the two always agree. `raw.schedules` stays as published.
  - **107 kickoff times.** 102 games listed at `09:00` kicked off at 21:00: 97 Monday night games in 2000–05, two Saturday games in 2001 and three Thursday openers in 2003–05 (a 12-hour clock slip). Five 2017–18 London games listed at `21:30` kicked off at 09:30.
  - **8 venues.** All seven 2025 international games are filed under the designated home team's US stadium (São Paulo as SoFi, Dublin as Pittsburgh, three London games as Cleveland/MetLife/Jacksonville, Berlin as Indianapolis, Madrid as Miami), and `2026_05_PHI_JAX` under Jacksonville. Croke Park (`DUB00`) and the Olympiastadion (`BER00`) were added to `stadiums.csv`; `validate_stadiums` counts corrected ids as used.
  - **3 roofs.** The São Paulo and Berlin games carried SoFi's and Lucas Oil's roofs and become `outdoors`. Madrid's Bernabéu roof position on 2025-11-16 wasn't reported, so that game's roof is unknown (NULL): no roof type, no weather.
- **Guards.** `test_schedule_corrections_still_needed` (pytest, raw) flags a correction nflverse has since changed. dbt tests on `stg_schedules` fail if a non-neutral game kicks off before 09:30 ET, or if a neutral-site game (Super Bowls exempt) is at the regular home stadium of either team playing. "Either team", not any team: almost every Super Bowl and seven real relocations (2003 wildfires, 2010 Metrodome collapse, 2014 and 2022 Detroit snow games, the 49ers in Arizona in 2020, Hurricane Ida 2021, the 2025 LA fires) are at some other team's stadium.
- **Why:** the wrong times put 87 open-air games' weather 12 hours off (6.6 °F colder than nflverse's reading on average, r = 0.854; 0.973 after the fix). The wrong venues would have given those games Pittsburgh's or Miami's weather and, in the travel features, zero time zones crossed. The stadium seed's venue check verified the venues nflverse listed, not whether each game was filed at the right one.

### 2026-10-17 — Game-level buckets

- **Precipitation (Rob's choice):** `none` / `light_rain` / `heavy_rain` / `snow`. Snow when the game-window snowfall is above 0; otherwise heavy rain at 0.10 in or more over the window, light rain from 0.01 in, and `none` below 0.01 in (trace amounts count as dry). Snow stays one bucket so it isn't split into tiny samples (146 games). This settles rule 3 of the Phase 2 weather rules.
- **Roof:** the four roof values come from the stadium's physical roof plus the game's own state; on a retractable roof, nflverse's `dome` (Toronto's shut roof) means closed. Unknown states stay NULL.
- **Temperature and wind** are rounded to whole numbers before bucketing, so the labels' integer ranges hold (32.4 °F is "32 or below"). Wind uses the game-window maximum.
- **Time slot:** by Eastern kickoff. Sunday games before noon (international mornings) and Thursday/Monday games before 19:00 (Thanksgiving afternoons, holiday games) are `other`, as are Friday, Tuesday and Wednesday games. Playoffs follow the same clock rules; `is_primetime` is any kickoff at 19:00 ET or later.
- **Opponent type:** nflverse's `div_game` (right for every era); conferences from today's teams, except Seattle counts as AFC before 2002.
- **Why:** each rule follows the registry's value sets and the warehouse's weather rules; the edge cases are decided once here so every split agrees.

### 2026-10-17 — Team-level rules and team codes

- **Spread role (Rob's choice):** five tiers at football's key numbers 3 and 7, from the team's own spread: `big_favourite` (−7 or more), `favourite` (−3 to −6.5), `pickem` (under 3 either way), `underdog` (+3 to +6.5), `big_underdog` (+7 or more). A plain favourite / underdog / pick'em split leaves the sizes open; this keeps every bucket large (2,228–3,645 team-games).
- **Spread sign:** `team_spread` uses the betting convention (negative = favourite): the home team gets `−spread_line`, the away team `+spread_line`. Checked on Super Bowl LVII.
- **Rest:** 5 days or less counts as `short`, including Friday games after a Sunday, even though from 2026 the NFL no longer calls Friday games a short week. The bucket describes days of rest, not the league's label.
- **Venue:** at a neutral site both teams' `venue` is `neutral`; `is_home` still marks the designated home team.
- **Team codes:** staging maps relocated teams' codes to today's franchise (OAK→LV, SD→LAC, STL→LA) everywhere, keeping the listed codes on `stg_schedules`. `stg_teams` holds the 32 current franchises only (LAR, a second Rams code in nflverse's teams data, is dropped too). A franchise's history reads as one team, e.g. the Raiders' Oakland years under LV.

### 2026-10-17 — Six more kickoff corrections

- **Changed:** `schedule_corrections.csv` gains six `gametime` fixes (124 values in all). They turned up while checking the body clocks, and each is confirmed by the NFL's gamebook or the teams' published schedules.
  - Five 2000 home games are listed an hour early. nflverse mishandled daylight saving time in the two zones that skipped it:
    - Colts `2000_02_OAK_IND` and `2000_08_NE_IND` are at 12:00. They kicked off at noon in Indianapolis, which was 1:00 pm ET.
    - Cardinals `2000_04_GB_ARI` is at 15:05, and `2000_06_CLE_ARI` and `2000_07_PHI_ARI` at 15:15. They kicked off at 1:05 and 1:15 pm in Arizona, so 4:05 and 4:15 pm ET.
  - `2016_02_TB_ARI` is listed at 13:00, which was the 1:05 pm local kickoff written as ET. It kicked off at 16:05 ET.
- **Guard:** `stg_no_early_local_kickoff` fails if a finished game at a team's own stadium kicks off before 11:30 local time. The earliest real ones are three 11:30 am Central playoff games in 2000–01. It would not have caught the three 2000 Arizona games, at 12:05 and 12:15 local. Those were found by listing every Arizona home kickoff during daylight saving time.
- **Why:**
  - Wrong kickoffs give wrong body clocks: the 2016 game read 10:00 am for Arizona at home.
  - They also give wrong time slots: four games move from `sunday_early` to `sunday_late`.
  - The three open-air 2000 Arizona games took their weather from an hour too early. The local weather reload (`--only weather --seasons 2000,2016`, from the cache) updated the 4 games that have weather rows.

### 2026-10-17 — Travel and body clock

- **Home stadium:** `team_seasons` takes each team's home per season as the stadium of most of its non-neutral home games, ties to the latest used. Travel is measured from there, including for a designated home team at a neutral site.
- **Time zones:** `time_zone_shift` is the venue's UTC offset minus the home stadium's, both read at the kickoff instant with IANA zones, so Arizona's year-round standard time is handled. It's wrapped into −12..+12, because the body adjusts the short way round: LA to Melbourne is 7 zones west, not 17 east. 1999 has no kickoff times, so it reads the clocks at 1 pm ET on the game day.
- **Time-zone travel buckets (Rob's choice):** `none` / `eastbound_1_3` / `westbound_1_3` / `long_haul_4_plus`. Over finished games that's 10,265 / 2,175 / 2,167 / 105. Three buckets would leave trips of 4+ zones out, and putting them in "3 zones" would hide them. Nearly all of them are to Europe; the 2 westbound ones are the 2026 Melbourne game. The signed shift stays a number for the models.
- **Body clock (Rob's choice):** kickoff on the team's home clock, bucketed at noon, 4 pm and 7 pm into `morning` / `afternoon` / `late_afternoon` / `night`, on every row; for the home team it's local time. Over finished games: 789 / 9,293 / 2,049 / 2,063, plus 518 from 1999 with no kickoff time.
- **Distance:** `travel_miles`, the haversine distance on a sphere of radius 3,958.8 miles, rounded. Teams playing at their own stadium read 0, including the Jets and Chargers on the road at the stadium they share.
- **Why:** these define the time-zone travel and body-clock situations and travel distance, with the edge cases (DST, the date line, 1999, shared stadiums) decided once here.

### 2026-10-17 — Game stats from play-by-play

- **Two kinds of play count:**
  - `plays` and `yards` follow the official box score: passes, runs (scrambles included), kneels and spikes; no penalty no-plays, no two-point tries.
  - EPA/play, success rate and pass rate use real plays: nflverse's `pass` / `rush` flags, which leave out kneels and spikes but keep penalised snaps (the nflfastR convention), with two-point tries left out.
  - Filtering to real plays applies to the efficiency stats. The box score counts kneels: Kansas City's two kneel-downs at the end of Super Bowl LVII are why its yards are 340, not 347.
- **Turnovers:** interceptions thrown plus fumbles lost. The trimmed play-by-play has no fumbling-team column, so a lost fumble is charged to the receiving team on punts, to the intercepting team on interception returns, and to `posteam` otherwise (the offense, or the receiving team on kickoffs). This agrees with the play text on 99.7% of 2,981 lost fumbles since 2016; the rest are multi-fumble plays.
- **Known gap:** nflverse files 24 intentional groundings since 2016 as `no_play`; the box score counts them as pass attempts. `plays` can be 1 below the official total in those games (Pittsburgh, 2025-09-14: 58 against 59). Their texts vary, and one even says "no intentional grounding because of defensive holding", so no rule was added for them.
- **Defense** is the opponent's offense in the same game, joined rather than recomputed, so the two always agree.
- **Why:** both checked games match ESPN's official team stats on every figure except that one grounding play, so the site's yards, turnovers, 3rd-down and red-zone numbers will match what fans see in published box scores.

### 2026-10-17 — Form features

- **Sequence:** each team's games within a season in date order. The playoffs continue it, and it restarts each season, so week 1 has no previous result, streak or blowout flag. Carrying form over the offseason would have flagged 188 more week-1 games as "after a blowout loss", because of last season's final game.
- **Blowout loss (Rob's choice):** lost the previous game by 17 or more, a three-score margin: 1,789 team-games. The other options were 14+ (2,350) and 21+ (1,188).
- **Streak:** signed, entering the game. A tie resets it to 0.
- **Rest:** `games_since_bye` counts from the last game after 13+ days off (as `rest_bucket` defines a bye, playoff byes included) or from the season start.
- **Road games:** `consecutive_road_games` counts this game, because its venue is known in advance, and treats a neutral site as a road game.
- **Entering the game (Rob's revision):** every feature uses only earlier results plus this game's schedule, so the columns are valid before kickoff, as pregame models require. `data-model.md` explains why.

### 2026-10-17 — Situation registry

- **Changed:**
  - `situations.csv` names two columns `column_name` and `value_list` (pipe-separated, in display order) rather than `column` and `values`, because both are SQL keywords.
  - It loads into `marts`, not `staging`, because the website reads it.
  - It has 13 rows: 12 situations, with time slot's primetime flag as its own filter.
- **Level (Rob's revision):** a `level` column marks each situation `game` (the same for both teams) or `team` (can differ). League-level win % is only meaningful for team-level situations; game-level ones are compared on scoring and over/under rate (`data-model.md`, and the parking lot for Phase 4).
- **Generated SQL:** the `situation_registry()` macro reads the seed with `run_query` while dbt runs, so tests (and the split marts) loop over the registry instead of listing situations by hand. dbt can't see references made inside those loops while parsing, so each caller declares them with `-- depends_on:` comments.
- **Why:** one table drives the site's filters, the split marts and their tests, so adding a situation is a CSV row plus its column.

### 2026-10-17 — Split marts

- **Playoffs (Rob's choice):** both split marts carry `season_type` (`REG` / `POST`) in their grain, so a regular-season split never mixes in playoff games, and the site can still add the two together. `team_games` gains the column, from `is_playoff`.
- **Win % (Rob's revision):** (wins + ½ × ties) / games, the NFL standings definition. The marts store wins, losses, ties and games; the rate is computed when read.
- **2020 home record:** the league's regular-season `home` row for 2020 is 253 games, 127–125–1 (.504), against the published 127–128–1 (.498) in 256. The difference is the 49ers' three Glendale games (weeks 13, 14 and 17, all losses), which nflverse lists as neutral-site games, so their venue is `neutral`. Adding them back reproduces the published figure exactly; `splits_2020_home_record` pins both. They stay `neutral`: the 49ers weren't at home. 2020 is still the lowest home win % of any complete season either way (next: 2021 at .511, 2019 at .520).
- **Betting results on `team_games`:** `ats_result` (cover / push / no_cover, from margin + `team_spread`) and `total_result` (over / under / push, from both scores against `total_line`). The marts count them; cover % and over % leave pushes out of the denominator.
- **Measures:** sums and counts only, never averages. `stats_games` counts the games with play-by-play, so stat rates over a range that starts before 2016 divide by the right number. Play-by-play sums are NULL, not 0, when there's no play-by-play.
- **`situation_level` carried in both marts:** the registry's `game` / `team` level, so a league view can filter to team-level situations for win % without a join.
- **Types:** every count and integer sum is cast to `integer`. Postgres's `SUM` of a `bigint` is `numeric`, and the site's `pg` driver returns `bigint` as a string (the 1.10 lesson).
- **Why:** the two choices are Rob's; the rest makes the marts safe to re-aggregate over any season range.

### 2026-10-17 — Tests and docs

- **Every column described, shared ones once:** all 391 columns of the staging and marts relations (seeds included) have a description. Columns that several models carry (the 24 play-by-play stats, the game-level situations, the keys) use dbt docs blocks in `transform/models/_docs.md`, so their meaning can't drift between models.
- **Comments in Postgres:** `+persist_docs` (relation and columns) for models and seeds, so DBeaver and psql show the descriptions without the docs site.
- **Test gaps:** `not_null` on every column that is never NULL by design, `accepted_values` on `division`, the stadium roof and `stg_pbp.season_type`, and two singular tests: `games_finished_complete` (a finished game has scores, the overtime flag and both lines, which `ats_result` and `total_result` rely on) and `mart_splits_counts_consistent` (each split row's counts agree with each other). Columns left without a column test are NULL for documented reasons (1999 kickoffs, unplayed games, pre-2016 stats, open-air-only weather) or are pinned by singular tests (box scores, mirror, additivity). The build went from 166 to 290 checks.
- **Docs server:** the `dbt-docs` launch entry serves `transform/target/` with Python's `http.server`, not `dbt docs serve`. `dbt docs serve` is a single-threaded server, and the browser pane's speculative pre-connection takes its only slot, so `catalog.json` never loads and the page stays empty. The files served are identical; run `dbt docs generate` first.
- **Why:** filled test gaps and a lineage graph make the warehouse auditable; descriptions in the database and the docs site make every column explainable to someone who has only the database in front of them.

### 2026-10-17 — Marts built in production

- **Weather reload first (Rob approved):** Neon's `raw.game_weather` was reloaded from the cache for 2000–2005, 2016–2018 and 2025 before the build, as the schedule-corrections entries required: 1 inserted, 97 updated, 0 deleted. Without it, `stg_kickoff_matches_weather` would have failed on 91 games, and 7 international 2025 games would have carried the wrong stadium's weather. This completed the Neon reloads those entries called for.
- **Build:** `dbt build` against Neon passed 290/290; the marts match local row for row. Neon now holds 212 MB of its 1 GB (marts 17 MB).
- **No new grants:** `web_reader` still reads only `raw`. Granting `marts` and revoking `raw` waited until the site started reading the marts (2026-10-19).

## Team situation analysis

### 2026-10-17 — Analysis rules, set before any effect is estimated

Logged and pushed before any effect estimate was run, so the evidence can't be read to fit a conclusion afterwards. Any change before the estimates gets its own dated entry; any change after is reported in `docs/findings.md` as a change made after seeing the results.

- **Games (Rob's choice):** finished regular-season games, 1999–2025: 6,967 games. EPA uses 2016–2025 (2,639 games). 2026 (in progress) and the 309 playoff games are left out. 2020 is left out of venue comparisons only. Everything is rerun on 2016–2025 as a robustness check; that rerun is descriptive and doesn't change a verdict.
- **The independent unit is the game.** `team_games` has two mirrored rows per game, so no standard error treats them as two observations. Ratio statistics (EPA/play) get bootstrap CIs that resample whole games (2,000 resamples); other CIs are the estimate ± 1.96 standard errors.
- **Team-level situations (Rob's choice): head-to-head.** Venue, rest, time-zone travel, body clock and spread role are measured on games where exactly one team has the value, one row per game: the side with the value. Its win score (win 1, tie ½, loss 0) and margin are compared with the same season's mean for the same venue (home, away or neutral), so the road-team disadvantage and the shrinking home edge don't masquerade as travel or rest effects. Venue itself is measured raw (home win % against .500, home margin against 0), without 2020.
- **Shared values go to game level (Rob's choice).** Short rest (9 head-to-head games; 300 where both teams were short) and long haul (1; 49 where both were) are measured as game-level situations, on the games where both teams share them. Claude's extension, same reason: pick'em (0 head-to-head; both teams in all 1,424) is measured the same way. Neutral venue (both teams neutral in all 66 games) is reported with its n only.
- **Game-level situations:** roof, surface, temperature, precipitation, wind, time slot, primetime and opponent type, one row per game. Total points are **season-adjusted** (the game's total minus that season's mean game total), so rising scoring and the move to domes aren't confused. Over % leaves pushes out and is compared with the league's over % over the same games. Weather enters only as its buckets.
- **Primary metrics** (they decide the verdicts):
  - Team-level: venue-adjusted win % and venue-adjusted margin.
  - Game-level (short rest, long haul and pick'em games included): season-adjusted total points and over %.
- **Secondary metrics** (descriptive, no effect on verdicts):
  - EPA/play: net (offense minus defense) for team-level values, both offenses combined for game-level values. 2016–2025.
  - Cover %.
  - For team-level values, **margin vs spread** (Rob's revision): the mean of `margin + team_spread`, the points beyond the market's expectation, which controls for team strength (the morning body-clock bucket is mostly West Coast teams, for example). The spread already prices venue, so it isn't venue-adjusted again. `docs/findings.md` says, for each team-level effect, whether it survives this adjustment.
- **Tests and correction (Rob's choice):** each primary metric of each value gets a two-sided test against its baseline. Benjamini–Hochberg at q = 0.05 corrects over the whole family of primary tests in the situation-effects analysis. Exact mirror pairs count once, since they are the same games seen from the other side: home/away, favourite/underdog and big favourite/big underdog.
- **Practical size:**
  - Team-level: 1 point of margin, or 3 percentage points of win %.
  - Game-level: 2 points of total, or 5 percentage points of over %.
- **Verdicts (Rob's choice), per registry row** (13: the 12 v1 situations, with primetime as its own row):
  - **Feature:** at least one value has a primary metric that is significant after the correction and at least the practical size.
  - **Trim:** every value's 95% CI on both primary metrics lies inside ± the practical size, so a real effect of that size has been ruled out.
  - **Keep as a filter, not featured:** anything else (inconclusive).
  - **Venue and spread role always stay**, as the context every other split is read against.
- **Dependencies:** `matplotlib` (charts) and `statsmodels` (regression, the Benjamini–Hochberg correction; it brings `scipy`) are added to the dev group beside `jupyter`, because only the notebooks use them.
- **Why:** a plain comparison with the league baseline misleads. In team-level situations, both teams often share the value, and travel and body clock are tied to being the away team. So the plain league split would show short rest and pick'em at 50% by construction and charge the road disadvantage to travel.

### 2026-10-17 — Analysis rules amended before any estimate

Logged and pushed before any estimate was run, like the entry above, which it amends. Where the two differ, this one wins.

- **Strength control (Rob's addition), secondary and descriptive.**
  - For a team-level head-to-head game, the *strength-adjusted margin* is the side's margin minus (its strength − the opponent's strength). It is then compared with the venue baseline, like the primary margin.
  - A team's strength is its mean venue-adjusted margin (margin minus that season's mean for its venue) in its *other* regular-season games that season.
  - **Leave-one-out:** the game being analysed is left out of both teams' strengths, so its own result can't leak into the control.
  - Strengths are computed once from the full data, and the bootstrap treats them as known.
  - They use games played later in the season, so they describe rather than predict. They aren't pregame features.
- **Margin vs spread is venue-adjusted after all.** This reverses one clause of the entry above. `margin + team_spread` is compared with the same season's mean for the same venue, like the other two margins, so the three readings below share one baseline. If the market mis-prices home field in some seasons, buckets made mostly of away teams (eastbound and westbound travel, the morning body clock) would otherwise inherit that mis-pricing as if it were their own.
- **Reading a team-level finding (Rob's rule, written up in `findings.md`).**
  - Three margins are compared: venue-adjusted (the raw effect), strength-adjusted and spread-adjusted.
  - An adjusted effect *survives* when its 95% CI excludes zero on the same side as the raw effect.
  - The readings:
    - **Disappears under the strength control:** team composition, i.e. which teams fall in the bucket.
    - **Survives strength but not the spread:** real, and priced in by the market.
    - **Survives both:** real and under-priced.
    - **Any other combination** is reported as it falls. An example is a spread-adjusted effect on the opposite side, which would mean the market over-adjusts.
  - Spread role is set by the market from the teams' own results, so its strength reading is circular. It is reported, not classified.
- **Weather against other open-air games (Claude's addition), secondary and descriptive.** Weather values are also compared with the same season's mean over open-air games only. The primary comparison is with the whole league, domes included, so on its own it would credit the outdoor-vs-dome difference (which the roof situation measures) to the weather.
- **Method details, fixed before any estimate:**
  - **Standard errors** all come from the game-level bootstrap: 2,000 resamples of whole games with a fixed seed. Every baseline (venue and season means, the league over %) is recomputed inside each resample. A baseline contains the bucket's own games, so a formula that held it fixed would overstate the uncertainty of large buckets. CIs are the estimate ± 1.96 bootstrap SE; p-values use the same SE (two-sided normal test).
  - **EPA/play** is computed per game (EPA divided by dropbacks plus rushes) and averaged over games, each game counting once, rather than pooled over plays. Net EPA/play (team-level) is venue-adjusted like margin; combined EPA/play (game-level) is season-adjusted like total points.
  - **Cover %** is reported raw, pushes excluded, as the site will show it. The venue-adjusted margin vs spread carries the market comparison.
  - **The Benjamini–Hochberg family has 90 tests:**
    - 13 team-level values × 2 metrics: home; normal, extra and bye rest; no zone change, eastbound and westbound; the four body clocks; the two favourite tiers.
    - 32 game-level values × 2 metrics: the 29 game-level situation values, plus the short-rest, long-haul and pick'em games.
- **Why:** the strength control and the three readings are Rob's. The rest makes each reading compare like with like, and fixes how uncertainty is measured before any result is seen.

### 2026-10-18 — Shrinkage strength from persistence

- **Changed:** the first approach estimated k (how many games of luck equal the real differences between teams) from how much 2023–2025 splits vary beyond luck. The analysis instead estimates the real variation from persistence: the covariance between each team's own split in 2015–2019 and in 2021–2025 (pairs with 5+ games in both windows). Luck in the two windows is unrelated, so what they share is real. The within-window estimate is still shown beside it.
- **Why:** three seasons give each situation only about 100 small splits, and that estimate was noisy. It put venue's real variation at zero, although home splits are the most persistent of all (r = 0.41 between the windows). The covariance uses ten seasons and is about three times more precise. It also measures the part of a split that lasts, which is what an estimate for the coming games needs.
- **Result:** k ranges from 119 games (body clock) to 666 (temperature). A team's own split gets weight n / (n + k), so even 25 games keep at most 17%.

### 2026-10-18 — The v1 situation list

- **Verdicts confirmed (Rob):** the pre-registered rule's verdicts stand (`docs/findings.md`).
  - **Feature:** precipitation, wind, roof and rest.
  - **Keep as filters:** temperature, time slot, time-zone travel and body clock.
  - **Trim:** surface, primetime and opponent type.
  - **Stay as context:** venue and spread role.
- **Trimmed means `in_v1` false.** The three rows stay in `situations.csv`, `team_games` keeps their columns, and the split marts keep their data (the registry macro reads every row); the site just won't offer them in v1. `situations_columns_exist.sql` now pins all 14 keys and their flags.
- **Rest advantage added (Rob's choice of buckets), a team-level v1 situation.** `team_games.rest_advantage` buckets `rest_diff`: −3 or less `less_rest`, +3 or more `more_rest`, otherwise `even`. A 1–2 day gap counts as even; 3+ is a Thursday game or a bye on one side. Over finished regular-season games 1999–2025 that's 1,320 / 11,294 / 1,320 team-games. The rest finding is about the difference between the teams, while the short-rest bucket holds both teams in 300 of its 309 games. The original rest buckets stay as a filter. The mirror test checks that one side's `less_rest` is the other's `more_rest`.
- **Weather caveat (Rob's addition):** the findings now say that our weather is what happened, while betting totals were set on forecasts. The low over % in rain and wind is therefore partly hindsight, not proof of a market inefficiency.
- **Notebooks pinned to the analysed situations:** notebooks 04 and 06 select the 13 situations the analysis covered (`PHASE3_SITUATIONS`), so adding rest advantage to the registry doesn't change or break the pre-registered analysis. Re-run after the change, their results are identical.
- **Why:** Rob's decision on the evidence. Rest advantage turns the rest finding into a filter that can show it; the short-rest bucket can't.

## Website

### 2026-10-19 — Data access layer: Drizzle reads, dbt owns the schema; web_reader moves to marts

- **Drizzle, stable releases:** `drizzle-orm` 0.45 and `drizzle-kit` 0.31, the current stable lines; 1.0 is still in beta.
- **Pull only.** `npm run db:pull` (`drizzle-kit pull`) introspects the `marts` schema (`schemaFilter`) into `web/drizzle/schema.ts`, which is committed and never edited. drizzle-kit also writes a migration file, its metadata and an empty relations file; those are gitignored and lint skips the generated folder. dbt creates every table, so Drizzle never runs `push`, `generate` or `migrate`. `drizzle.config.ts` loads `web/.env.local` with `@next/env`, the way Next.js does.
- **Every column is typed nullable.** dbt builds marts with `CREATE TABLE AS`, which copies no NOT NULL constraints: 0 of the 242 introspected columns are NOT NULL, although dbt's tests guarantee many are never NULL. The database doesn't enforce what the tests check, so the types tell the truth. Aggregate queries declare their result types; simple selects keep the nullable types and the pages handle NULL.
- **SQL in development.** Drizzle logs each query's SQL and parameters to the dev server's output, so any number on a page can be traced to its query.
- **web_reader reads marts only, changed in two phases (Rob's revision: expand → deploy → contract).**
  - `pipeline/sql/web_reader.sql` (expand) grants `USAGE` on `marts`, `SELECT` on its tables, and default privileges. dbt recreates every mart table on each build (new table, swap, drop the old), and a dropped table loses its grants; default privileges make each new table readable the moment it's created. They cover tables created by the role that runs the file, so it runs as the owner that also runs dbt.
  - `pipeline/sql/web_reader_revoke_raw.sql` (contract) removes `SELECT` and `USAGE` on `raw` and its default privileges from the initial setup.
  - `pipeline/create_web_reader.py` gains `--grant-only` (expand only), `--keep-password` (no rotation, so Vercel's `DATABASE_URL` stays valid) and `--check` (connects as `web_reader` and reports what it can read and write). A plain run still applies everything and rotates the password.
  - Tested on local Postgres with a throwaway role: Neon's current state reproduced, then expand, then a dbt rebuild of all six mart models (the role still read all 7 tables), then contract (raw 0 of 4 readable), then a rerun that changed nothing. The role was dropped afterwards.
- **Why:** least privilege for the site. The order means the live site never loses access to what it's reading: the grants come first, then the deploy of the code that reads marts, then the revoke.
- **Neon (Rob approved each phase):** expand, then the deploy of the code that reads marts, then contract, all on 2026-10-19. The final `--check` shows marts 7 of 7 readable, staging and raw 0 readable, writes refused. The live site rendered at every stage. Vercel's `DATABASE_URL` didn't change, because the password was kept.
- **npm audit:** drizzle-kit brings a moderate esbuild advisory (its development server answers any website's requests). It's dev-only and that server is never started; `npm audit --omit=dev` still finds 0 vulnerabilities. Added to the parking-lot npm audit entry.

### 2026-10-19 — Design direction and app shell

- **Design approved by Rob after two rounds** of screenshots of a throwaway sample page (real BUF 2024–2026 numbers, desktop and phone, light and dark), deleted once approved. The decisions that later steps build on:
  - **Tokens:** every colour is a role in `web/app/globals.css`, defined once for light and once for dark: warm neutral surfaces and one blue accent. Contrast measured on the worst surface: text 4.7:1 or more (quiet text such as n and CIs included), chart bars 3.8:1 (light) and 4.3:1 (dark), control outlines 3:1. The bar colour passes the dataviz skill's validator in both modes.
  - **Type:** Geist Sans only; tabular figures in tables and axes, proportional figures for big standalone numbers.
  - **Plain language on the site:** no internal phase or step names. The featured group is "Situations that measurably change results", linking to the methodology page; then "Other situations" (filters) and "Context". The level chips read "Same for both teams" and "Differs by team", each with a tooltip.
  - **Featured vs filter vs context** never by colour alone: a text label and heading plus an accent rule.
  - **Splits tables:** a grouped "League" header over the league columns, each league figure with its n; CIs on their own quiet line under each value; the shrunk column reads "75% / 14% from these games", with a tooltip explaining shrinkage. On phones the table scrolls sideways with the value column pinned, an edge fade and a "Swipe for more columns" cue.
  - **Charts (level-aware, Rob):** team-level situations chart margin per game; game-level situations chart the game total of the team's games. Both have CI whiskers, a line for the team's all-games figure, a tall tick for the league in that value, values in a fixed right-hand column (no label collisions), and an arrowhead where a whisker runs off the axis.
  - **Team header (Rob):** a band in the team's primary colour with a thin secondary-colour stripe and contrast-chosen text, a faint abbreviation monogram behind the name, a home-field facts row from `stadiums.csv` (stadium's current name, city, roof, surface, elevation, time zone), and a sparkline of regular-season win % for every season since 1999 with the selected range highlighted. Headline stats sit below it, 2×2 on phones. Team colours and abbreviations only, never logos.
- **Shell:** shadcn/ui (Radix primitives, Nova preset) with only the components used so far: `button` and `sheet` (the phone menu), copied into `web/components/ui/`. shadcn's `cn` package replaces clsx + tailwind-merge. The `shadcn` package itself is a devDependency: `globals.css` imports its Tailwind variants at build time, and as a runtime dependency its CLI's dependencies made `npm audit --omit=dev` report 7 findings (the same `braces` advisory as the lint toolchain). It now reports 0.
- **Light/dark:** next-themes puts a `.dark` class on `<html>` before paint, following the system unless the viewer chooses. The toggle is one icon button cycling system → light → dark, with an accessible label.
- **Layout:** header (site name, nav, menu button on phones, theme toggle), a 1,180 px content column, and a footer crediting nflverse and Open-Meteo (CC BY 4.0), with "Not affiliated with the NFL" and "Analysis, not betting advice". The nav lists only views that exist; each new view adds its link. The current link is marked with `aria-current`, rendered behind a Suspense boundary because the path is per-request under Cache Components.
- **Screenshots:** the browser pane scales a 1280 px viewport down, and a hidden pane pauses the animation frames React uses to reveal streamed content. Full-size checks use headless Chrome (`--force-dark-mode` for dark); phone widths go through a 375 or 390 px iframe, because headless Chrome won't open a window that narrow.

### 2026-10-19 — Teams index and dim_teams

- **No logos (Rob's rule):** the teams index shows team colours, not logos. `dim_teams` carries names, today's conference and division, and both colours, but no logo or wordmark URLs, so the site can't show a trademark by accident. Teams appear as abbreviation badges on their primary colour.
- **Badge text by contrast:** `web/lib/team-colors.ts` picks white or the site's near-black ink, whichever contrasts more with the team colour (WCAG 2 formula). A unit test checks that the result clears 4.5:1 on all 32 primaries: white on Bills blue, near-black on Saints gold and Bengals orange. A hairline ring keeps dark badges (Bears, Raiders, Steelers) visible on the dark theme.
- **Colours stored upper-case:** nflverse mixes `#a5acaf` and `#A5ACAF`; the mart normalises them so the format test and comparisons are simple.
- **NULL narrowing in the query layer:** `getTeams()` returns a `Team` type with no nullable fields. Its `present()` helper throws if a column dbt tests as `not_null` ever arrives as NULL, rather than rendering "null".
- **Vitest 4.1, not 5:** Vitest 5 requires `@types/node` 22 or later, and the app pins 20. 4.1 is the latest line that accepts 20, so the Node type definitions didn't move just for a test runner. `npm test` runs the web unit tests.

### 2026-10-19 — Team page header and season records

- **dim_stadiums, a new mart:** the approved header shows home-field facts (stadium, city, roof, surface, elevation, time zone) that live only in the `stadiums` seed, in `staging`, which `web_reader` can't read. `dim_stadiums` exposes those columns from `marts`. The 14 bracketed notes in seed names are removed (current name only, as Rob asked). They aren't all former names, since some say which stadium is meant ("Tiger Stadium (LSU)"), so no "former name" column was kept.
- **Records without a new mart:** each season's record is the team's `venue` rows in `mart_team_splits` summed with `FILTER (WHERE season_type = ...)`, so one query gives the regular season and the playoffs side by side. `team_games` adds games still to play and how the playoffs ended (the last playoff game's round and result, via `array_agg(... ORDER BY gameday DESC)[1]`).
- **Official check (Done when):** all 27 Washington seasons 1999–2025 match Wikipedia's "List of Washington Commanders seasons", which cites the NFL: every regular-season W–L–T including the 2016 and 2022 ties, and every playoff record. NFL.com's 2022 standings match Buffalo (13–3, 455–286), Washington (8–8–1, 321–343) and Cincinnati (12–4); Buffalo and Cincinnati played 16 games after the cancelled Week 17 game. `team_records_match_official` pins these so a rebuild can't change them silently.
- **Header stats for the selected seasons:** record, win %, margin per game and games (n) over the default range, the latest three seasons (2024–2026 now), computed by summing seasons' counts in `web/lib/records.ts`. The sparkline shades the same range, and the URL can choose it.
- **Surface names** are mapped to readable labels in the page (A-Turf, FieldTurf, and so on), marked "(artificial)" when the surface type is turf. The time zone shows its everyday name ("Eastern Time") from the IANA zone.

### 2026-10-19 — Team page splits table

Built to a plan agreed with Rob, with the decisions and changes below.

- **Registry columns.** `situations.csv` gains `tier` (featured / filter / context, NULL exactly when `in_v1` is false), `sort_order`, `value_labels` (aligned with `value_list`), `shared_values` and `shrinkage_k`. `situations_display_columns` tests that they agree with the rest of the row. Adding seed columns needs `dbt build --full-refresh --select situations`, because a plain `dbt seed` re-inserts into the existing table.
- **Rest advantage's k = 673 games, and very imprecise** (notebook 06, an added section after the pre-registered analysis, which re-ran unchanged).
  - **Estimate:** 96 pairs, 2015–19 against 2021–25; r = +0.03 [−0.21, +0.27].
  - **Range:** a team bootstrap (`SEED`, 2,000 resamples) puts k between 68 games and unbounded, and 41% of resamples find no repeating variance (k infinite). Rest's k = 129 runs from 30 to unbounded by the same bootstrap.
  - **Why it's still usable:** a 10-game split keeps 1.5% of the weight at the estimate, and at most 13% at the low end.
  - **Tied to the seed:** the notebook asserts that all 14 `shrinkage_k` values in `situations.csv` match its estimates.
- **Sums of squares.** Both split marts gain `margin_sq` = Σ margin² and `total_points_sq` = Σ (points for + against)².
  - **Exact SDs:** these add up like counts, so any season range gives an exact standard deviation, SD = √((Σx² − n·mean²)/(n − 1)). It matched Postgres's `stddev_samp` over the raw games to four decimals.
  - **Written x·x:** `x * x`, not `x ^ 2`, because `^` returns a float.
  - **Integer is safe:** the largest league value is about 1.07 million. `mart_splits_counts_consistent` checks n·Σx² ≥ (Σx)² in `bigint`, since n·Σx² reaches about 435 million.
- **Confidence intervals** (`web/lib/stats.ts`):
  - **Win % and over %:** Wilson score intervals, which stay inside 0–100% and keep a width at 2–0.
  - **Margin and game total:** Student's t intervals from the sums of squares. Up to 30 degrees of freedom, t comes from a table. Above 30, rather than a flat 1.96, a Cornish–Fisher expansion is used instead (2.040 at 31, 2.000 at 60, accurate to 0.001), so the multiplier doesn't jump from 2.042 to 1.96.
  - **Edge cases:** one game gives no interval, and a game total's interval stops at 0 points.
  - **League game-level figures** halve the team-game sums, because each game appears once per team. The league's n is games, and its intervals aren't too narrow.
- **Shrunk win %:** notebook 06's formula over the selected seasons and season types, with the league split weighting all 32 teams. It's checked end to end: `/teams/lv?from=2023&to=2025` reads light rain 2–0, shrunk 29.6% with 1.6% from these 2 games (k = 120), as in the notebook. The cell shows a whole percent and the share; a tooltip gives the exact figure and k.
- **Level-aware columns:**
  - **Team-level situations:** league win % and margin, blank for the shared values (venue `neutral`, rest advantage `even`, spread role `pickem`, rest `short`).
  - **Game-level situations:** the team's game total and over %, beside the league's.
  - **Away baseline:** each team-level block except venue notes the league's away win % for the same seasons.
- **The 2020 venue rule on team pages.** When the range includes 2020, the venue block (team rows, league rows and venue's shrinkage) leaves 2020 out unless `?with2020=1`. A note and a link toggle it. Every other block and the header keep 2020. The split queries group by `season = 2020`, so no second query is needed.
- **URL state.** `?from&to&playoffs&with2020`, parsed by `web/lib/season-range.ts`:
  - **Parsing:** seasons are clamped to 1999 through the latest, a reversed range is swapped, unreadable values take their defaults, and unknown parameters are ignored.
  - **Links:** links built by the site leave defaults out; the GET form always sends from and to.
  - **Check:** pasting a URL into a fresh tab gives identical page text.
- **Rob's decisions before the splits table was built:**
  - **The League header on phones:** below 768 px the grouped "League" row is dropped and each header spells it out ("League total", "League over %"). Wider screens keep the grouped header.
  - **Headline totals follow the playoffs toggle:** they're the team's venue rows summed over the selected seasons and season types, labelled "with playoffs" when it's on.
  - **Header band edge:** a 1 px top border in `--rule-strong` on the team band. The site header's own `--border` hairline already sat there, but at `#2f2f2c` it barely shows against Las Vegas's or Pittsburgh's black, so a second `--border` line would have changed nothing.
- **Small layout choices:**
  - **Sticky controls on wider screens only:** the range row is sticky only from 768 px up. On phones it wraps to three lines, too tall to keep on screen while scrolling.
  - **No empty chart column yet:** the table took the block's full width until the split charts were added (beside it from 1,280 px; see the split charts entry).
  - **Swiped tables stay readable:** the last table column gets extra right padding on phones, so a fully swiped table doesn't fade its last figures.

### 2026-10-19 — Team page split charts

Level-aware: team-level situations chart the team's margin per game in each value, game-level situations the game total of its games. Each chart has 95% CI whiskers, a line for the team's all-games figure and a tall tick for the league in that value. Changes from the plan:

- **HTML and CSS, not one SVG.** Each row is a grid (label, plot, value), and the marks are positioned in percent of the plot. Text stays at its real size at every width, which a scaled SVG `viewBox` wouldn't do. Only the arrowheads are small inline SVGs. Still no chart library.
- **A labelled list, not `role="img"`.** Each bar row is a focusable list item whose accessible name reads the whole figure, e.g. "Light rain: 33.0 points per game, both teams, 95% CI 33.0 to 33.0, 2 games, 2–0; league 43.3". Focusable children inside `role="img"` would be hidden from screen readers. The tooltip shows the same on hover and on keyboard focus, and the table stays the chart's text equivalent.
- **Whiskers get a surface halo.** A whisker over its own bar contrasts only 2.0:1 with it, so whiskers and their caps carry a 1 px ring in the block's surface colour (the dataviz skill's surface ring).
- **Colours, validated with the dataviz skill's `validate_palette.js`:** the bar passes on all four surfaces it sits on (`--card` and `--secondary`, light and dark). Whiskers 7.8:1 or more, the reference line 5.8:1 or more, the tick 13.7:1 or more.
- **Axes hold the values, not the CIs.** The axis is chosen to hold every bar, tick and the reference line: margin ±10, ±20 or ±30 (ticks at the halves), total 0 to the next multiple of 20, capped at 80. CIs from a few games are often enormous (a 2-game margin can run ±130), so a whisker that leaves the axis ends in an arrowhead, and so does a bar beyond ±30 (only a 1-game split gets there).
- **Side by side from 1,280 px; stacked below that.** The 10-column game-level table needs about 790 px, so beside the chart (1.6 : 1 rather than the planned 1.75 : 1) its cells are a little tighter, and the shrunk cell's "from these games" line wraps. Below 1,280 px the chart goes under the table, capped at 40 rem; on phones the table comes first, as planned.
- **Done-when check:** every bar's value and label equals the table's figure: 330 situation blocks on 30 pages (10 teams × 3 ranges), 0 mismatches.
- **Live (deployed 2026-10-19, no database change):** all 32 team pages, as rendered in the browser, have 11 situation blocks, each with a chart holding one bar per table row. `/teams/lv?from=2023&to=2025` reads light rain 2–0, shrunk 29.6% (1.6% from these 2 games, k = 120), with its chart row at 33.0 points per game. (Parsing the raw streamed HTML instead misplaces blocks, because React's production stream is stitched together by scripts, so live checks read the rendered page.)

### 2026-10-19 — Situation explorer

Built to a plan agreed with Rob on 2026-10-19, with his decisions from that planning session.

- **Filters in the URL, checked against the registry.**
  - Each filter is a v1 registry key, repeated for "either" within a situation and combined with AND across situations: `?wind=10_to_14&wind=15_plus&venue=away`. `from`, `to`, `playoffs`, `with2020` and `team` are reserved; tracking parameters (`utm_*`, `fbclid`, `gclid`) are ignored.
  - Anything else is **rejected**: an unknown key (including a column name such as `wind_bucket`), a value not in the registry, a trimmed situation (`surface`), or an unknown team. The page names it, runs no query and links to the URL without it. This is a message, not HTTP 400: Next has no 400 for pages, and the results stream. The dev log confirms a rejected URL runs only the registry, team-list and latest-season lookups.
  - Season parameters stay lenient, as on the team pages.
- **SQL built safely.** `explorerStatement` in `web/lib/queries.ts` writes each filter as `tg."<column>"::text = any($n::text[])`. The column comes from the registry row the key named (`sql.identifier`, and it must match `^[a-z_]+$`); the values are one bound parameter. Arrays go through `sql.param`, because Drizzle spreads a bare array into `($1, $2)`. A Vitest test renders the statement with hostile values through `PgDialect.sqlToQuery` and checks they appear only in the parameters.
- **Head-to-head league results (Rob's choice).**
  - Games where only one team matches report that team's record, win % and margin, against the venue norm: the league's win % and margin at the same venue in the same season, averaged over the matched games. When venue is the only filter, the norm would equal the result, so the comparison is an even game (50%, 0).
  - Games where both teams match report points per game and over %, each game once (its home row), against the season norm.
  - The norms come from `mart_league_splits`' venue rows.
  - Over 1999–2025, rest = normal splits into 1,329 one-sided and 5,221 shared games; pooled, its 11,771 team-games would sit near 50% by construction.
- **Since 2016 by default (Rob's choice).** The explorer opens on 2016 to the latest season, unlike the team pages' last three seasons: combinations need the games (outdoors + 15+ mph wind + away: 36 games over the last 3 seasons, about 200 since 2016).
- **2020.** Left out when venue is a filter and the range includes 2020, with a note and a link to include it, as on team pages.
- **Team view.** An optional team shows its own record, win % and margin in the matching games (plus scoring when every filter is the same for both teams), beside its record in all games in those seasons. No shrunk estimate: there's no k for a combination.
- **Small samples.** Margin and game-total intervals are dropped below 3 games ("too few games for a range"), through `MIN_GAMES_FOR_INTERVAL` in `lib/stats.ts`. The team pages adopt the same rule in build-plan step 1.4.
- **Reading line.** Each league card ends with a plain sentence, e.g. "0.8 points a game worse than that. The range includes zero, so this could be chance.", and every filtered view notes "Try enough combinations and some will look real by chance."
- **Layout.** Filters in a left column from 1,024 px; on phones the results come first, with a "Change situations" link down to the form.
- **Tests.** `web/vitest.config.mts` adds the `@/` alias and maps `server-only` to an empty module, so tests can import `queries.ts`.
- **Done-when (local, current data).**
  - All 45 single values, 20 random two- and three-situation combinations and 5 of them with a team render results with no error.
  - `?wind_bucket=15_plus`, `?foo=1`, `?wind=hurricane` and `?wind=15_plus';drop table x--` are rejected.
  - Hand-checks against independent SQL: away + outdoors + 15+ mph wind, 2016–2025 (`pipeline/sql/checks/explorer_example.sql`): 198 games, 86–111–1, −2.55 a game against the away norm's 45.3% and −1.79; outdoors + 15+ mph wind: 236 shared games, 41.62 points, 102 overs of 235; BUF in those games: 31 games, 22 wins, +213; rest = normal: 1,329 / 5,221.

### 2026-10-19 — Leaderboards

Built to the plan agreed on 2026-10-19, with Rob's ranking decision.

- **Ranked by the best estimate (Rob's choice).** Every team in one situation value, sorted by its shrunk win % (notebook 06's estimate, as on the team pages), with the raw W–L, raw win % with its Wilson CI and n beside it.
  - **The evidence:** over 2024–26 in light rain, 15+ mph wind, 3+ days more rest and at home, the estimate's order matched overall win % almost exactly (rank correlation 0.996–0.999). A raw leader such as CIN at 3–0 in light rain has a best estimate of 46.9%.
  - **Greyed out under 5 games** (`MIN_GAMES_RANKED`), below a "Fewer than 5 games in these seasons" row, still in estimate order. Teams with no games show "no games" and no estimate. On current local data, 15+ mph wind ranks 4 teams and greys 28; heavy rain greys 31; Home greys none.
  - **Usual column:** the team's win % in all its games over the same seasons, so the reader sees that the estimate is mostly that plus the league's effect.
  - **Ties** go to the larger n, then the team code, so the order is stable.
- **One computation for every page.** `valueStatsByTeam` (extracted from `buildSplits` in `lib/splits.ts`) returns every team's n, record, win % and shrunk estimate in a value; the team page, the leaderboard and This week use it. A unit test checks that each team's leaderboard figures equal its team-page row for the same inputs; live spot checks of six team-value pairs agreed.
- **League line, level-aware.** Team-level values both teams don't usually share show the league's win % with its n (team-games). Game-level and shared values say both teams share it and show the games, points per game and over % (league sums halved to games).
- **URL.** `?situation=wind&value=15_plus&from&to&playoffs&with2020`, opening on Venue: Home over the last 3 seasons (the one team split that persists, r = 0.41). An unknown situation or value is rejected with a message, as in the explorer. Changing the situation in the form leaves the value out (the value select is disabled before submitting), so the page opens on that situation's first value.
- **The 2020 venue rule** applies to the venue boards, with the same note and toggle as the team pages. Team-level boards other than venue carry the away-baseline note.
- **Rows link** to the team's page at the same range, scrolled to that situation's block.

### 2026-10-19 — This week

Built to the plan agreed on 2026-10-19, with Rob's answer on what each team shows.

- **Which week.** The latest season's lowest week with a game still to play (playoff rounds are weeks 19–22), with every game of that week. A week in progress shows its finished games with final scores. No game scheduled (the offseason before the schedule comes out) shows an empty state. The page reads both `team_games` rows of each game, with `dim_stadiums` for the stadium's name, city and physical roof.
- **Featured situations lead with the league-wide effect (Rob's choice).**
  - **The effects:** roof and the weather situations show the season-adjusted total (each game's points minus its season's average game, averaged over 1999–2025 regular seasons). Rest advantage shows the plain win % and margin of the side with the value. Both come from `mart_league_splits`, by `lib/effects.ts`, and match `docs/findings.md`: heavy rain −5.1, light rain −2.8, snow −1.2, 15+ mph wind −3.8, 10–14 mph −1.9, dome +2.8, 3+ days less rest 48.4% and −1.0 a game.
  - **The CI** (on hover) holds each season's mean fixed, so it can differ from the findings' bootstrap CI by about 0.1 at one end: heavy rain reads −7.0 to −3.2 here and in the findings.
  - **Pinned:** `transform/tests/featured_effects_match_findings.sql` recomputes those eight numbers in SQL and fails if one changes at one decimal (checked by breaking one on purpose).
  - **Even rest** reads "No rest edge either way."
- **Every situation carries the team's line:** its record and best estimate over the default seasons (`valueStatsByTeam`, as on the team page and leaderboard), linking to that block on the team page.
- **Layout.** Each game card shows the featured rows (roof, weather, each side's rest advantage) and keeps the rest (time slot, rest, time-zone travel, body clock, venue, spread role) behind an "Other situations" disclosure. Teams on a bye are listed in the regular season.
- **Weather until forecasts are shown:**
  - dome: "Indoors: weather doesn't apply."; a closed retractable roof: "Roof closed: weather doesn't apply.";
  - a retractable roof on an unplayed game, whose state isn't known yet: "Retractable roof: open or closed is decided on game day.";
  - an unplayed open-air game: "Forecast not available yet.";
  - a finished game: its recorded buckets, or "Recorded weather is added about a week after the game." (Open-Meteo's archive lag);
  - one page note with the reference effects, computed rather than typed: heavy rain about 5 points, 15+ mph wind about 4.
- **Kickoffs** are shown as nflverse gives them, Eastern wall-clock time ("Sun Oct 18, 1:00 pm ET"), parsed as text so no time zone conversion can shift them.
- **Done-when (local, current data: week 6 in progress).**
  - `pipeline/sql/checks/this_week_situations.sql` recomputes every team's rest days from its previous game date: 0 differences.
  - Hand-checked on the page: SEA at DEN (Thursday night; 4 days' rest, short; SEA 1 zone east, 5:15 pm body clock; SEA −2.5 within 3), HOU vs JAX in London (9:30 am ET, "other" slot, both neutral; HOU 6 and JAX 5 zones east, morning body clocks), LAC at KC (KC off a bye with 3+ days more rest, LAC 2 zones east), ARI at LA (0 zones in October). No West Coast team kicked off at 1 pm ET this week, so LAC and ARI stood in for that case.
  - The featured effect lines equal the findings (dbt test passes).


## Fantasy application

Decided on 2026-10-21 from verified data (`docs/build-plan.md`, Data sources), with Rob's review. `docs/requirements.md` holds the product requirements these serve.

### 2026-10-21 — Stack and architecture

- **Changed:** the fantasy features use the existing stack with no new services: Python loaders write `raw`, dbt builds `staging` and `marts`, Python projections append to `raw.player_projections`, dbt grades them in `marts`, and the site reads `marts` as `web_reader`. Run records live in `raw.pipeline_runs` and `raw.source_loads`, exposed through `marts.data_freshness`.
- **Why:** the product is a nightly batch with small tables and read-only, cacheable traffic. Forecasts are history that dbt must never rebuild, and reading them as a dbt source avoids a circular dependency. `web_reader`'s default privileges on `marts` already cover every new mart.

### 2026-10-21 — Player data: sources, range and identity

- **Changed:** player data comes from nflverse weekly player stats, players, weekly rosters and snap counts, from 2016, keyed by GSIS `player_id`. `raw.player_stats_weekly` keeps every player with an ID, not only skill positions. Play-by-play isn't reloaded. Injury designations, depth charts, participation and expected-points data are not used.
- **Why:** weekly stats carry every MVP metric. nflverse has almost no targets for 2003–2008, and play-by-play starts in 2016. Team share denominators need every player: nflverse's `target_share` divides by all rows in the team-game, and non-skill players hold 0.13% of targets. Requirements §1.4 excludes injury reporting; participation isn't published in season; depth charts have no week grain.

### 2026-10-21 — Snap counts are required

- **Changed:** snap counts decide whether a player appeared. A missing week is shown as pending, never as zero or did-not-play.
- **Why:** a player gets a stats row only when he records a stat. 8,381 of 65,965 regular-season skill appearances since 2016 (12.7%) have offensive snaps but no stats row. Their PFR IDs map to GSIS IDs for 99.80–100% of rows in every season.

### 2026-10-21 — Scoring defined once

- **Changed:** Standard, Half-PPR and PPR come from one rules seed through one dbt macro, tested against hand-computed fixtures and against nflverse's own points. The website and Python read stored points. Projections forecast non-reception points and receptions, so the three formats can't disagree.
- **Why:** with player special-teams return TDs at +6 and fumbles lost counted on offensive plays, the requirements' rules reproduce nflverse's `fantasy_points` and `fantasy_points_ppr` with 0 mismatches in 188,522 player-games (2016–2026). Half-PPR is exactly (Standard + PPR) / 2. Rob confirms the two edge rules with their counts when scoring is built.

### 2026-10-21 — Participation states

- **Changed:** every player-week has exactly one state:
  - `played`;
  - `special_teams_only`;
  - `did_not_play`;
  - `bye`;
  - `scheduled`;
  - `pending`;
  - `cancelled`.

  Rolling windows and season-to-date divide by `played` games, and share denominators come from the same games. Only played states carry points.
- **Why:** averages over the wrong denominator inflate players who miss games, and showing a missed game as 0 is false.

### 2026-10-21 — Point-in-time features

- **Changed:**
  - **The rule.** A feature may use a game only if it was in an earlier week and its kickoff plus the source's publication lag (`source_availability.csv`) is before `as_of`.
  - **Timing and eligibility.** Backtests use `as_of` 24 hours before the week's first kickoff, and the previous week's roster.
  - **Never inputs:** the target week's roster status, spread and total lines, weather and injuries.
  - **Stored inputs.** Live forecasts store the inputs they used.
- **Why:**
  - nflverse publishes corrected stats, and Pro Football Reference revises snaps.
  - A week's roster status includes game-day inactives, announced about 90 minutes before kickoff.
  - Lines have no point-in-time history, and requirements §1.3 rules out betting features.
  - Stored inputs let the revision drift be measured, which states the limit of backtest fidelity.

### 2026-10-21 — Forecast archive and grading

- **Changed:**
  - **Append-only.** A trigger refuses UPDATE and DELETE on `raw.player_projections`, and a CHECK requires `as_of` before the kickoff known at the time.
  - **New rows only on change.** A row is added only when the inputs or the model version change.
  - **No schedule key.** There is no foreign key to schedules.
  - **Which forecast is graded.** Grades use the last forecast before the actual kickoff, with statuses for flexed, cancelled and did-not-play games. They stay `provisional` for 10 days, then `final`.
  - **Backup.** The archive is exported weekly.
- **Why:** forecasts can't be rebuilt after the fact. Cancelled games disappear from the schedule. Stat corrections should change grades, not forecasts.

### 2026-10-21 — Evaluation seasons and models

- **Changed:**
  - **Seasons:** development 2017–2023 (walk-forward), validation 2024 for every choice, test season 2025 opened once, live 2026.
  - **Models:** baselines first. A ridge regression ships only if it beats them on validation with a confidence interval that excludes zero. No LightGBM in the MVP.
- **Why:** a sealed test season gives a true out-of-sample result before live weeks accumulate, and simple baselines are the bar any model must clear.

### 2026-10-21 — Freshness and partial failure

- **Changed:**
  - **Independent loaders.** Each source loads on its own and records its outcome; one failure doesn't stop the others.
  - **Required sources** (schedules, player stats) gate dbt. Snap counts are late-tolerant.
  - **Critical tests** sit at staging, so a failure skips the marts, and the site refreshes only when no critical test failed.
  - **Visible gaps.** Pages say what is pending.
- **Why:** dbt builds a table before testing it. Pro Football Reference publishes snap counts on its own schedule, so a late file must not block or corrupt the rest.

### 2026-10-21 — Build order and release milestones

- **Changed:**
  - **Reliability first.** Error states, caching, CI and a nightly refresh come before any player code.
  - **Navigation last.** The research pages move under `/research`, with 308 redirects, only after the new pages pass.
  - **Milestones:** the Research Beta (Gate C), the Reliable Weekly Application (Gate D), the Predictive MVP v1.0 (Gate E) and the Portfolio-ready Release (Gate F), each with a checkable acceptance list in the build plan.
- **Why:** on 2026-10-21 the site had no CI, no caching, a soft 404 and no automation, so production data was two days stale. The player features then inherit these patterns.

## Baseline and reliability

### 2026-10-21 — Baseline checks before any Phase 1 change

Step 1.1: every check run once, before any change, on commit `cfbf291` (`main`, in sync with `origin/main`, clean tree).

- **Environment:** Windows 10 Pro, Docker 29.8.2 with the `postgres:18` container (18.6) on port 15432, Python 3.13.3 via uv 0.13.1, Node 24.15.0 with npm 11.12.1. nflreadpy 0.1.5, pandas 3.0.6, dbt-core 1.12.6 with dbt-postgres 1.11.0.
- **Results:**

  | Check | Result |
  | --- | --- |
  | `uv run pytest` | 46 passed, 0 skipped, 0 failed (3.9 s). The 7 `local_only` upsert tests ran against local Postgres, so the 39 recorded for Phase 0 plus these 7. |
  | `uv run python -m pipeline dbt build` (local) | PASS=332, WARN=0, ERROR=0, SKIP=0: 4 seeds, 8 tables, 4 views, 316 data tests (12 s). |
  | `npm ci` | Installed 732 packages from the lockfile. |
  | `npm run lint` | 0 problems. |
  | `npm test` (Vitest 4.1.12) | 9 files, 110 tests passed. |
  | `npx tsc --noEmit` | 0 errors. |
  | `npm run build` (Next.js 16.4.1, against local Postgres) | Compiled; 9 static pages generated. `/` and `/_not-found` static; `/explorer`, `/leaderboards`, `/teams`, `/teams/[team]` and `/this-week` partial prerenders. |

- **Failures: none,** so no fix step and no new parking-lot entry are needed before 1.2.
- **Environmental, not application issues:**
  - Docker Desktop wasn't running at the start of the session; it was started and the existing `dnd-postgres` container came up with its data. Every database check needs it.
  - `npm ci` reports 13 audit findings (4 moderate, 9 high), all from the two dev-only advisories already in the parking lot: `braces` (GHSA-vfj7-8cjw-p6xm) through `eslint-config-next` and the `shadcn` CLI, and `esbuild` (GHSA-67mh-4wv8-2f99) through drizzle-kit. `npm audit --omit=dev` finds 0. Nothing new; the parking-lot entry now names the `shadcn` path too.
- **Why:** measuring before changing anything means any later failure can be traced to the step that caused it, rather than to something that was already broken.
