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

## 2026-10-17 — "You try first" retired; Claude writes all code

- **Changed:** the "You try first" label is gone from `docs/build-plan.md` (2.1, 2.6, 2.9, 2.11, 3.3, 3.4, 6.10) and from `CLAUDE.md`. Claude Code writes all code, including SQL, statistics and analysis, and walks Rob through each SQL- or analysis-heavy step clause by clause afterwards. Judgment calls the plan doesn't settle (bucket definitions, data corrections, scope changes) are a hand-back: options with counts and a recommendation. `pipeline/sql/checks` are now simply "SQL checks".
- **Why:** Rob would rather keep the build moving and be able to explain finished, working code in interviews. This completes the 2026-10-16 change.

## 2026-10-17 — dbt runs through a wrapper; exact schema names (step 2.2)

- **Changed:** dbt-core 1.12 and dbt-postgres 1.11 (both pinned below 2.0, which is still a release candidate). `dbt_project.yml` was written by hand instead of `dbt init`, which would have nested a second project folder inside `transform/`. `transform/profiles.yml` is committed with no secrets: it reads `DBT_HOST`, `DBT_PORT`, `DBT_USER`, `DBT_PASSWORD`, `DBT_DBNAME` and `DBT_SSLMODE`, which `uv run python -m pipeline dbt …` (`pipeline/run_dbt.py`) fills in from `DATABASE_URL`. A `generate_schema_name` macro makes models land in exactly `staging` and `marts`, not dbt's default `staging_marts`-style names. Anonymous usage stats are off.
- **Why:** `DATABASE_URL` stays the single switch between local and Neon for both the pipeline and dbt, and the passwords never get copied into a second set of variables.

## 2026-10-17 — Seeds load into the staging schema (step 2.3)

- **Changed:** `dbt seed` loads `stadiums` and `team_code_map` into `staging` (e.g. `staging.stadiums`), not a schema of their own.
- **Why:** it keeps the database to the three documented schemas (`raw`, `staging`, `marts`). Seeds are cleaned reference data that staging and marts join to. A seed the website must read (e.g. 2.10's `situations.csv`) can set its own `+schema: marts`.

## 2026-10-17 — Schedule corrections: kickoff times and international venues (step 2.4)

- **Changed:** `transform/seeds/schedule_corrections.csv` (key `game_id` + `column_name`; columns `nflverse_value`, `corrected_value`, `note`) fixes 118 values nflverse publishes wrongly. `stg_schedules` applies it in SQL and the weather loader applies it in Python (`pipeline/corrections.py`), so the two always agree. `raw.schedules` stays as published.
  - **107 kickoff times.** 102 games listed at `09:00` kicked off at 21:00: 97 Monday night games in 2000–05, two Saturday games in 2001 and three Thursday openers in 2003–05 (a 12-hour clock slip). Five 2017–18 London games listed at `21:30` kicked off at 09:30.
  - **8 venues.** All seven 2025 international games are filed under the designated home team's US stadium (São Paulo as SoFi, Dublin as Pittsburgh, three London games as Cleveland/MetLife/Jacksonville, Berlin as Indianapolis, Madrid as Miami), and `2026_05_PHI_JAX` under Jacksonville. Croke Park (`DUB00`) and the Olympiastadion (`BER00`) were added to `stadiums.csv`; `validate_stadiums` counts corrected ids as used.
  - **3 roofs.** The São Paulo and Berlin games carried SoFi's and Lucas Oil's roofs and become `outdoors`. Madrid's Bernabéu roof position on 2025-11-16 wasn't reported, so that game's roof is unknown (NULL): no roof type, no weather.
- **Guards.** `test_schedule_corrections_still_needed` (pytest, raw) flags a correction nflverse has since changed. dbt tests on `stg_schedules` fail if a non-neutral game kicks off before 09:30 ET, or if a neutral-site game (Super Bowls exempt) is at the regular home stadium of either team playing. "Either team", not any team: almost every Super Bowl and seven real relocations (2003 wildfires, 2010 Metrodome collapse, 2014 and 2022 Detroit snow games, the 49ers in Arizona in 2020, Hurricane Ida 2021, the 2025 LA fires) are at some other team's stadium.
- **Why:** the wrong times put 87 open-air games' weather 12 hours off (6.6 °F colder than nflverse's reading on average, r = 0.854; 0.973 after the fix). The wrong venues would have given those games Pittsburgh's or Miami's weather and, in step 2.7, zero time zones crossed. Step 1.5's venue check verified the venues nflverse listed, not whether each game was filed at the right one.
- **Neon:** its `raw.game_weather` still holds the old rows. Reload with `ingest --only weather --seasons 2000-2005,2017,2018,2025` (`DATABASE_URL` set to Neon) before step 2.13's production build; ask Rob first.

## 2026-10-17 — Game-level buckets (step 2.5)

- **Precipitation (Rob's choice):** `none` / `light_rain` / `heavy_rain` / `snow`. Snow when the game-window snowfall is above 0; otherwise heavy rain at 0.10 in or more over the window, light rain from 0.01 in, and `none` below 0.01 in (trace amounts count as dry). Snow stays one bucket so it isn't split into tiny samples (146 games). This settles rule 3 of the Phase 2 weather rules.
- **Roof:** the plan's four values come from the stadium's physical roof plus the game's own state; on a retractable roof, nflverse's `dome` (Toronto's shut roof) means closed. Unknown states stay NULL.
- **Temperature and wind** are rounded to whole numbers before bucketing, so the labels' integer ranges hold (32.4 °F is "32 or below"). Wind uses the game-window maximum.
- **Time slot:** by Eastern kickoff. Sunday games before noon (international mornings) and Thursday/Monday games before 19:00 (Thanksgiving afternoons, holiday games) are `other`, as are Friday, Tuesday and Wednesday games. Playoffs follow the same clock rules; `is_primetime` is any kickoff at 19:00 ET or later.
- **Opponent type:** nflverse's `div_game` (right for every era); conferences from today's teams, except Seattle counts as AFC before 2002.
- **Why:** each rule follows the plan's v1 value sets and the Phase 2 weather rules; the edge cases are decided once here so every split agrees.

## 2026-10-17 — Team-level rules (step 2.6) and team codes (step 2.4)

- **Spread role (Rob's choice):** five tiers at football's key numbers 3 and 7, from the team's own spread: `big_favourite` (−7 or more), `favourite` (−3 to −6.5), `pickem` (under 3 either way), `underdog` (+3 to +6.5), `big_underdog` (+7 or more). The plan's "favourite / underdog / pick'em, by spread size" left the sizes open; this keeps every bucket large (2,228–3,645 team-games).
- **Spread sign:** `team_spread` uses the betting convention (negative = favourite): the home team gets `−spread_line`, the away team `+spread_line`. Checked on Super Bowl LVII.
- **Rest:** 5 days or less counts as `short`, including Friday games after a Sunday, even though from 2026 the NFL no longer calls Friday games a short week. The bucket describes days of rest, not the league's label.
- **Venue:** at a neutral site both teams' `venue` is `neutral`; `is_home` still marks the designated home team.
- **Team codes:** staging maps relocated teams' codes to today's franchise (OAK→LV, SD→LAC, STL→LA) everywhere, keeping the listed codes on `stg_schedules`. `stg_teams` holds the 32 current franchises only (LAR, a second Rams code in nflverse's teams data, is dropped too). A franchise's history reads as one team, e.g. the Raiders' Oakland years under LV.

## 2026-10-17 — Six more kickoff corrections (step 2.7)

- **Changed:** `schedule_corrections.csv` gains six `gametime` fixes (124 values in all). They turned up while checking 2.7's body clocks, and each is confirmed by the NFL's gamebook or the teams' published schedules.
  - Five 2000 home games are listed an hour early. nflverse mishandled daylight saving time in the two zones that skipped it:
    - Colts `2000_02_OAK_IND` and `2000_08_NE_IND` are at 12:00. They kicked off at noon in Indianapolis, which was 1:00 pm ET.
    - Cardinals `2000_04_GB_ARI` is at 15:05, and `2000_06_CLE_ARI` and `2000_07_PHI_ARI` at 15:15. They kicked off at 1:05 and 1:15 pm in Arizona, so 4:05 and 4:15 pm ET.
  - `2016_02_TB_ARI` is listed at 13:00, which was the 1:05 pm local kickoff written as ET. It kicked off at 16:05 ET.
- **Guard:** `stg_no_early_local_kickoff` fails if a finished game at a team's own stadium kicks off before 11:30 local time. The earliest real ones are three 11:30 am Central playoff games in 2000–01. It would not have caught the three 2000 Arizona games, at 12:05 and 12:15 local. Those were found by listing every Arizona home kickoff during daylight saving time.
- **Why:**
  - Wrong kickoffs give wrong body clocks: the 2016 game read 10:00 am for Arizona at home.
  - They also give wrong time slots: four games move from `sunday_early` to `sunday_late`.
  - The three open-air 2000 Arizona games took their weather from an hour too early. The local weather reload (`--only weather --seasons 2000,2016`, from the cache) updated the 4 games that have weather rows.
- **Neon:** step 2.13's weather reload now also needs 2016: `--seasons 2000-2005,2016-2018,2025`. This replaces the list in the 2.4 entry.

## 2026-10-17 — Travel and body clock (step 2.7)

- **Home stadium:** `team_seasons` takes each team's home per season as the stadium of most of its non-neutral home games, ties to the latest used. Travel is measured from there, including for a designated home team at a neutral site.
- **Time zones:** `time_zone_shift` is the venue's UTC offset minus the home stadium's, both read at the kickoff instant with IANA zones, so Arizona's year-round standard time is handled. It's wrapped into −12..+12, because the body adjusts the short way round: LA to Melbourne is 7 zones west, not 17 east. 1999 has no kickoff times, so it reads the clocks at 1 pm ET on the game day.
- **Time-zone travel buckets (Rob's choice):** `none` / `eastbound_1_3` / `westbound_1_3` / `long_haul_4_plus`. Over finished games that's 10,265 / 2,175 / 2,167 / 105. The plan's buckets left trips of 4+ zones out, and putting them in "3 zones" would hide them. Nearly all of them are to Europe; the 2 westbound ones are the 2026 Melbourne game. The signed shift stays a number for the models.
- **Body clock (Rob's choice):** kickoff on the team's home clock, bucketed at noon, 4 pm and 7 pm into `morning` / `afternoon` / `late_afternoon` / `night`, on every row; for the home team it's local time. Over finished games: 789 / 9,293 / 2,049 / 2,063, plus 518 from 1999 with no kickoff time.
- **Distance:** `travel_miles`, the haversine distance on a sphere of radius 3,958.8 miles, rounded. Teams playing at their own stadium read 0, including the Jets and Chargers on the road at the stadium they share.
- **Why:** these are the plan's v1 situations 9 and 10, plus the plan's travel distance, with the edge cases (DST, the date line, 1999, shared stadiums) decided once here.

## 2026-10-17 — Game stats from play-by-play (step 2.8)

- **Two kinds of play count:**
  - `plays` and `yards` follow the official box score: passes, runs (scrambles included), kneels and spikes; no penalty no-plays, no two-point tries.
  - EPA/play, success rate and pass rate use real plays: nflverse's `pass` / `rush` flags, which leave out kneels and spikes but keep penalised snaps (the nflfastR convention), with two-point tries left out.
  - The plan's "filter to real plays" applies to the efficiency stats. The box score counts kneels: Kansas City's two kneel-downs at the end of Super Bowl LVII are why its yards are 340, not 347.
- **Turnovers:** interceptions thrown plus fumbles lost. The trimmed play-by-play has no fumbling-team column, so a lost fumble is charged to the receiving team on punts, to the intercepting team on interception returns, and to `posteam` otherwise (the offense, or the receiving team on kickoffs). This agrees with the play text on 99.7% of 2,981 lost fumbles since 2016; the rest are multi-fumble plays.
- **Known gap:** nflverse files 24 intentional groundings since 2016 as `no_play`; the box score counts them as pass attempts. `plays` can be 1 below the official total in those games (Pittsburgh, 2025-09-14: 58 against 59). Their texts vary, and one even says "no intentional grounding because of defensive holding", so no rule was added for them.
- **Defense** is the opponent's offense in the same game, joined rather than recomputed, so the two always agree.
- **Why:** both checked games match ESPN's official team stats on every figure except that one grounding play, so the site's yards, turnovers, 3rd-down and red-zone numbers will match what fans see in published box scores.

## 2026-10-17 — Form features (step 2.9)

- **Sequence:** each team's games within a season in date order. The playoffs continue it, and it restarts each season, so week 1 has no previous result, streak or blowout flag. Carrying form over the offseason would have flagged 188 more week-1 games as "after a blowout loss", because of last season's final game.
- **Blowout loss (Rob's choice):** lost the previous game by 17 or more, a three-score margin: 1,789 team-games. The other options were 14+ (2,350) and 21+ (1,188).
- **Streak:** signed, entering the game. A tie resets it to 0.
- **Rest:** `games_since_bye` counts from the last game after 13+ days off (as `rest_bucket` defines a bye, playoff byes included) or from the season start.
- **Road games:** `consecutive_road_games` counts this game, because its venue is known in advance, and treats a neutral site as a road game.
- **Entering the game (Rob's revision):** every feature uses only earlier results plus this game's schedule, so the columns are valid before kickoff, as Phase 6's models require. `data-model.md` explains why.

## 2026-10-17 — Situation registry (step 2.10)

- **Changed:**
  - `situations.csv` has the plan's columns with two renames: `column` → `column_name` and `values` → `value_list` (pipe-separated, in display order), because both are SQL keywords.
  - It loads into `marts`, not `staging`, because the website reads it.
  - It has 13 rows: the plan's 12 situations, with time slot's primetime flag as its own filter.
- **Level (Rob's revision):** a `level` column marks each situation `game` (the same for both teams) or `team` (can differ). League-level win % is only meaningful for team-level situations; game-level ones are compared on scoring and over/under rate (`data-model.md`, and the parking lot for Phase 4).
- **Generated SQL:** the `situation_registry()` macro reads the seed with `run_query` while dbt runs, so tests (and 2.11's split marts) loop over the registry instead of listing situations by hand. dbt can't see references made inside those loops while parsing, so each caller declares them with `-- depends_on:` comments.
- **Why:** one table drives the site's filters, the split marts and their tests, so adding a situation is a CSV row plus its column.

## 2026-10-17 — Split marts (step 2.11)

- **Playoffs (Rob's choice):** both split marts carry `season_type` (`REG` / `POST`) in their grain, so a regular-season split never mixes in playoff games, and the site can still add the two together. `team_games` gains the column, from `is_playoff`.
- **Win % (Rob's revision):** (wins + ½ × ties) / games, the NFL standings definition. The marts store wins, losses, ties and games; the rate is computed when read.
- **2020 home record:** the league's regular-season `home` row for 2020 is 253 games, 127–125–1 (.504), against the published 127–128–1 (.498) in 256. The difference is the 49ers' three Glendale games (weeks 13, 14 and 17, all losses), which nflverse lists as neutral-site games, so their venue is `neutral`. Adding them back reproduces the published figure exactly; `splits_2020_home_record` pins both. They stay `neutral`: the 49ers weren't at home. 2020 is still the lowest home win % of any complete season either way (next: 2021 at .511, 2019 at .520).
- **Betting results on `team_games`:** `ats_result` (cover / push / no_cover, from margin + `team_spread`) and `total_result` (over / under / push, from both scores against `total_line`). The marts count them; cover % and over % leave pushes out of the denominator.
- **Measures:** sums and counts only, as the plan requires. `stats_games` counts the games with play-by-play, so stat rates over a range that starts before 2016 divide by the right number. Play-by-play sums are NULL, not 0, when there's no play-by-play.
- **`situation_level` carried in both marts:** the registry's `game` / `team` level, so a league view can filter to team-level situations for win % without a join.
- **Types:** every count and integer sum is cast to `integer`. Postgres's `SUM` of a `bigint` is `numeric`, and the site's `pg` driver returns `bigint` as a string (the 1.10 lesson).
- **Why:** these follow the plan's 2.11 with Rob's two answers; the rest makes the marts safe to re-aggregate over any season range.

## 2026-10-17 — Tests and docs (step 2.12)

- **Every column described, shared ones once:** all 391 columns of the staging and marts relations (seeds included) have a description. Columns that several models carry (the 24 play-by-play stats, the game-level situations, the keys) use dbt docs blocks in `transform/models/_docs.md`, so their meaning can't drift between models.
- **Comments in Postgres:** `+persist_docs` (relation and columns) for models and seeds, so DBeaver and psql show the descriptions without the docs site.
- **Test gaps:** `not_null` on every column that is never NULL by design, `accepted_values` on `division`, the stadium roof and `stg_pbp.season_type`, and two singular tests: `games_finished_complete` (a finished game has scores, the overtime flag and both lines, which `ats_result` and `total_result` rely on) and `mart_splits_counts_consistent` (each split row's counts agree with each other). Columns left without a column test are NULL for documented reasons (1999 kickoffs, unplayed games, pre-2016 stats, open-air-only weather) or are pinned by singular tests (box scores, mirror, additivity). The build went from 166 to 290 checks.
- **Docs server:** the `dbt-docs` launch entry serves `transform/target/` with Python's `http.server`, not `dbt docs serve`. `dbt docs serve` is a single-threaded server, and the browser pane's speculative pre-connection takes its only slot, so `catalog.json` never loads and the page stays empty. The files served are identical; run `dbt docs generate` first.
- **Why:** the plan's 2.12 asks for test gaps filled and the lineage graph; descriptions in the database and the docs site make every column explainable to someone who has only the database in front of them.

## 2026-10-17 — Marts built in production (step 2.13)

- **Weather reload first (Rob approved):** Neon's `raw.game_weather` was reloaded from the cache for 2000–2005, 2016–2018 and 2025 before the build, as the 2.4 and 2.7 entries required: 1 inserted, 97 updated, 0 deleted. Without it, `stg_kickoff_matches_weather` would have failed on 91 games, and 7 international 2025 games would have carried the wrong stadium's weather. This closes the Neon notes in those two entries.
- **Build:** `dbt build` against Neon passed 290/290; the marts match local row for row. Neon now holds 212 MB of its 1 GB (marts 17 MB).
- **No new grants:** `web_reader` still reads only `raw`. Granting `marts` and revoking `raw` stays in step 4.1, when the site starts reading the marts.

## 2026-10-17 — Phase 3 analysis rules, set before any effect is estimated (step 3.1)

Logged and pushed in step 3.1, before step 3.3 runs any estimate, so the evidence can't be read to fit a conclusion afterwards. Any change before 3.3 runs gets its own dated entry; any change after is reported in `docs/findings.md` as a change made after seeing the results.

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
- **Tests and correction (Rob's choice):** each primary metric of each value gets a two-sided test against its baseline. Benjamini–Hochberg at q = 0.05 corrects over the whole family of primary tests in step 3.3. Exact mirror pairs count once, since they are the same games seen from the other side: home/away, favourite/underdog and big favourite/big underdog.
- **Practical size:**
  - Team-level: 1 point of margin, or 3 percentage points of win %.
  - Game-level: 2 points of total, or 5 percentage points of over %.
- **Verdicts (Rob's choice), per registry row** (13: the 12 v1 situations, with primetime as its own row):
  - **Feature:** at least one value has a primary metric that is significant after the correction and at least the practical size.
  - **Trim:** every value's 95% CI on both primary metrics lies inside ± the practical size, so a real effect of that size has been ruled out.
  - **Keep as a filter, not featured:** anything else (inconclusive).
  - **Venue and spread role always stay**, as the context every other split is read against.
- **Dependencies:** `matplotlib` (charts) and `statsmodels` (regression, the Benjamini–Hochberg correction; it brings `scipy`) are added to the dev group beside `jupyter`, because only the notebooks use them.
- **Why:** the plan's 3.3 asks for effects "against the league baseline". In team-level situations, both teams often share the value, and travel and body clock are tied to being the away team. So the plain league split would show short rest and pick'em at 50% by construction and charge the road disadvantage to travel.
