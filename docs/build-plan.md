# Down & Distance — Build Plan

## About the project

A free, public website that shows how every NFL team performs in specific game situations (weather, venue, rest, travel, kickoff time) and predicts upcoming games from those patterns. The project is called Down & Distance.

**What it is**

A situational analytics site built on NFL play-by-play since 2016 and game results since 1999. Each team's results are split across 12 situations and compared with the league average, with the number of games behind every figure so small samples are obvious. A model predicts each week's games and publishes its graded track record.

**Who it's for**

- You, mainly: a personal tool for context before a game. How does this team play in the cold, on a short week, travelling west?
- Employers and interviewers: the live site, the public repo and the analysis write-up show SQL, data modelling, statistics and an automated data pipeline, end to end.
- It doubles as a sandbox for practising SQL and analysis on data you care about.

**How people access it**

In any web browser, on desktop or phone, at a subdomain of your portfolio site. There are no accounts or logins: every page is public, and every filtered view has a shareable link. The code is public on GitHub.

**What visitors can do**

- Open a team page: record and situational splits over any range of seasons.
- Combine situations in the explorer, e.g. outdoors + 15+ mph wind + away.
- Check leaderboards of the best and worst teams in each situation.
- See this week's games: the situations each team faces, the weather forecast and the model's prediction.
- Read the methodology and the model's track record.

**How you'll use it after launch**

- It runs itself during the season: a nightly job loads new games, rebuilds the tables, publishes predictions and grades last week's. You check the "data updated" stamp and act on GitHub's email if a run fails.
- Each preseason (August): re-enable the scheduled job, check nflverse for data changes, retrain the model.
- Ask new questions: connect to the Neon database from a notebook or Power BI; a good finding becomes a write-up or a new situation.
- Show it: link it from your portfolio and resume, and walk through it in interviews.
- Extend it: the v1.1 situations, then player-level analytics.

**What it is not**

Not a picks or tipping service. The site evaluates teams and its own model against pre-game spreads and totals (cover %, over/under %, model vs. the line), but it doesn't sell picks, promote sportsbooks or claim an edge it hasn't shown, and it carries a short note saying so.

**Launch, effort, cost**

- Launch: after Phase 7, predictions included. No deadline.
- Estimated effort: about 85–135 hours with Claude Code writing the automated steps.
- Cost: $0 per month on free tiers (Vercel Hobby, Neon Free, GitHub Actions on a public repo, Open-Meteo).
- Built on Windows 10 Pro with Docker Desktop and the Claude Code desktop app.

## How we work

Every step is one small change that we build, verify and commit before the next one starts, so a bug never spans more than one step.

A failed check sends you back to fix the code inside the same step; only a passing, committed step moves you on.

**Ground rules**

- Never start a step while the previous step's "Done when" check is failing.
- When something breaks: read the whole error message, make one guess, test it. Change one thing at a time.
- Before Claude Code writes anything, I explain the concept in plain English. After it writes, you read the diff, with a clause-by-clause walkthrough after SQL- or analysis-heavy steps.
- Claude Code writes all code, SQL and analysis included; Rob reviews the walkthroughs.
- Everything else is automated: Claude Code writes the Python pipeline, the frontend, the ML models and the deployment setup. On those steps, your job is to skim the diff and run the Done-when check.
- One commit per step, message starting with the step number, e.g. `1.4: load teams`.
- Secrets (database passwords, API keys) live in `.env` files that are never committed. `.env.example` lists their names with no values.
- Each phase ends with a checkpoint: the concepts you should now be able to explain out loud.

## Decisions locked in

The stack is Next.js on Vercel, Python batch jobs on GitHub Actions, and Postgres on Neon, in one public repo.

| Decision                | Choice                                                          | Why                                                                                                                      |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Web app                 | Next.js (App Router), TypeScript, Tailwind, on Vercel           | Your existing skills; deploys on every push                                                                              |
| Pipeline                | Python batch jobs (uv, nflreadpy, pandas) run by GitHub Actions | Data changes after games, so compute once and store the answer                                                           |
| Transformations         | SQL with dbt Core 1.x (`dbt-postgres`)                          | SQL is the core analyst skill; models are tested and versioned                                                           |
| Database                | PostgreSQL: Docker locally, Neon in production                  | Neon's free plan holds 1 GB per project and wakes itself after idle periods; Supabase's free projects pause after a week |
| Repo                    | One public GitHub repo                                          | Visible to employers; free Actions minutes                                                                               |
| ML                      | scikit-learn, then LightGBM                                     | Interpretable first, then stronger                                                                                       |
| Schedules range         | 1999 to present                                                 | Tiny table; long-run league trends                                                                                       |
| Play-by-play range      | 2016 to present                                                 | About 10 seasons of modern rules; fits Neon storage                                                                      |
| Team page default range | Last 3 seasons, adjustable                                      | Rosters turn over; recent games describe the current team                                                                |
| 2020 season             | Kept but flagged; excluded by default from home/away splits     | Played in mostly empty stadiums                                                                                          |
| Situation scope         | 12 in v1, built so adding more is cheap                         | Ship, validate, then expand                                                                                              |

### v1 situations

| #   | Situation        | Values                                                                                 | Source            |
| --- | ---------------- | -------------------------------------------------------------------------------------- | ----------------- |
| 1   | Venue            | home / away / neutral                                                                  | schedules         |
| 2   | Roof             | outdoors / dome / retractable open / retractable closed                                | schedules         |
| 3   | Surface          | grass / turf                                                                           | schedules         |
| 4   | Temperature      | 32°F or below / 33–50 / 51–79 / 80+                                                    | Open-Meteo        |
| 5   | Precipitation    | none / rain / snow                                                                     | Open-Meteo        |
| 6   | Wind             | under 10 / 10–14 / 15+ mph                                                             | Open-Meteo        |
| 7   | Time slot        | TNF / Sunday early / Sunday late / SNF / MNF / Saturday / other, plus a primetime flag | schedules         |
| 8   | Rest             | short (5 days or less) / normal (6–8) / extra (9–12) / off a bye (13+)                 | schedules         |
| 9   | Time-zone travel | none / eastbound 1–3 zones / westbound 1–3 zones                                       | stadiums table    |
| 10  | Body clock       | kickoff hour in the visiting team's home time zone                                     | stadiums table    |
| 11  | Opponent type    | divisional / conference / non-conference                                               | schedules + teams |
| 12  | Spread role      | favourite / underdog / pick'em, by spread size                                         | schedules         |

Every situation reports: games (n), win %, points for and against, margin, EPA/play on offense and defense, success rate, yards/play, turnover margin, cover % against the spread, and over/under hit %.

## Repo structure

One repo holds every part of the project; each top-level folder has one job, and one Python environment serves the pipeline, dbt and the notebooks.

```
down-and-distance/
├── pyproject.toml        one Python environment (managed by uv)
├── docker-compose.yml    local Postgres
├── .env.example          names of required secrets, no values
├── README.md
├── web/                  Next.js app: pages, components, Drizzle queries
├── pipeline/             Python: ingestion, weather, ML training and predictions
│   └── tests/            data checks and unit tests
├── transform/            dbt project
│   ├── seeds/            hand-made CSVs: stadiums, situations
│   ├── models/staging/   one cleaned model per raw table
│   └── models/marts/     tables the website reads
├── notebooks/            Jupyter exploration
├── docs/                 data model, findings, methodology
└── .github/workflows/    scheduled pipeline and pull-request checks
```

The database mirrors this with three layers: `raw` (copies of the sources, loaded by Python), `staging` (cleaned, built by dbt) and `marts` (what the website reads, built by dbt). The website's read-only user can only see `marts`.

## Phase 0 — Setup and walking skeleton

Goal: one table travels from nflverse to Python to Postgres to Next.js to a live URL. Ugly is fine; the point is proving every connection while the project is tiny.

- [x] **0.1 Install the tools (Windows).** Git for Windows (includes Git Bash, which Claude Code uses on Windows), Node.js LTS, uv (PowerShell installer), the GitHub CLI (`gh`), DBeaver and VS Code. Docker Desktop is already installed; confirm it uses the WSL 2 engine.
  - Learn: what each tool is for; PATH; PowerShell vs Git Bash.
  - Done when: `winver` shows version 22H2 (Docker Desktop's minimum on Windows 10), `wsl --status` shows WSL 2, and `git --version`, `node -v`, `uv --version`, `gh --version` and `docker --version` all print a version in a new PowerShell window.
- [x] **0.2 Create the repo and brief Claude Code.** Public GitHub repo in a folder outside OneDrive (e.g. `C:\dev\down-and-distance`), with the folders from Repo structure, `.gitignore`, `.gitattributes` (`* text=auto eol=lf`), a `README.md` stub, `.env.example`, this plan saved as `docs/build-plan.md`, and a `CLAUDE.md` holding the working rules.
  - Learn: `git init`, `add`, `commit`, `push`; why `.env` is ignored; why line endings matter when code written on Windows runs on Linux (GitHub Actions, Vercel).
  - Done when: the first commit is on GitHub, no `.env` file is, and `/context` in Claude Code lists `CLAUDE.md` under Memory files.
- [x] **0.3 Run Postgres locally in Docker.** `docker-compose.yml` with a Postgres container (same major version as Neon) and a named volume. If port 5432 is already taken, map 5433 instead.
  - Learn: containers, ports, volumes.
  - Done when: DBeaver connects, `SELECT 1;` returns 1, and data survives `docker compose down` then `up`.
- [x] **0.4 Set up the Python environment.** `uv init` at the repo root; add `nflreadpy`, `pandas`, `sqlalchemy`, `psycopg` and `python-dotenv`.
  - Learn: virtual environments, lock files, `uv run`.
  - Done when: a script prints the first 5 rows of the 2025 schedule.
- [x] **0.5 Load one season into Postgres.** Write the 2025 schedule to a `raw.schedules` table.
  - Learn: connection strings, schemas, how a dataframe becomes a table.
  - Done when: `SELECT COUNT(*) FROM raw.schedules;` returns 285 (272 regular-season plus 13 playoff games).
- [x] **0.6 Create the Next.js app.** `create-next-app` in `web/` with TypeScript, Tailwind and the App Router.
  - Done when: the starter page loads at localhost:3000.
- [x] **0.7 Read the table from Next.js.** A Server Component queries `raw.schedules` and renders a plain HTML table.
  - Learn: Server Components; why the database password never reaches the browser.
  - Done when: the page lists the 2025 games.
- [x] **0.8 Create the Neon database.** New Neon project; run the 0.5 loader against it by switching `DATABASE_URL`.
  - Learn: environment variables as the switch between local and production.
  - Done when: Neon's SQL editor also returns 285.
- [x] **0.9 Deploy to Vercel.** Import the repo, set the root directory to `web/`, add Neon's pooled connection string as `DATABASE_URL`.
  - Learn: build time vs run time; connection pooling.
  - Done when: a public URL shows the games.
- [x] **0.10 Give the website a read-only user.** Create a `web_reader` role that can only `SELECT`, and swap it into Vercel. For now it reads `raw.schedules`; in 4.1 it moves to `marts` only.
  - Learn: least privilege.
  - Done when: the site still works and an `INSERT` as `web_reader` fails.

Checkpoint: you can sketch the architecture and explain what travels along each arrow.

## Phase 1 — Ingestion (the raw layer)

Goal: every source loaded into `raw`, repeatable with one command, and checked.

- [x] **1.1 Set raw-layer conventions.** Raw tables copy the source as-is, plus a `_loaded_at` timestamp. Choose each table's primary key.
  - Learn: raw vs cleaned data; primary keys.
  - Done when: `docs/data-model.md` lists each raw table and its key.
- [x] **1.2 Load all schedules, 1999 to present.** The loader takes a `--seasons` argument and upserts on `game_id`.
  - Learn: upserts (`INSERT … ON CONFLICT … DO UPDATE`).
  - Note: the Phase 0 loader replaces `raw.schedules` on every run (`if_exists="replace"`). This step must switch it to an upsert, so rows are updated in place and the table (and its grants) is never dropped.
  - Done when: regular-season games per season are 248 for 1999–2001 (31 teams), 256 for 2002–2020 and 272 from 2021.
- [x] **1.3 Prove the load is idempotent.** Run it twice; edit one row by hand; run it again.
  - Learn: idempotency, and why it makes a failed job safe to rerun.
  - Done when: the count is unchanged after the second run and the edited row is restored.
- [x] **1.4 Load teams.** nflverse team data (names, divisions, conferences, colours, logos) into `raw.teams`.
  - Done when: every team code in `raw.schedules` matches a team, or appears in a written relocation map (OAK→LV, SD→LAC, STL→LA).
- [x] **1.5 Build the stadiums CSV.** `transform/seeds/stadiums.csv`: one row per `stadium_id` in schedules, with name, latitude, longitude, IANA time zone, altitude, roof type and surface.
  - Learn: reference data; why `America/Phoenix` beats "UTC−7" (Arizona skips daylight saving time).
  - Done when: no game has a `stadium_id` missing from the CSV, and 5 coordinates are spot-checked on a map.
- [x] **1.6 Fetch weather from Open-Meteo.** Four sub-steps:
  - 1.6a Convert each kickoff from Eastern time to UTC.
  - 1.6b Fetch one game's hourly weather and read the JSON by eye.
  - 1.6c Batch requests per stadium per season, caching responses to disk.
  - 1.6d Store temperature, precipitation, snowfall and wind at the kickoff hour in `raw.game_weather`.
  - Learn: APIs, JSON, time zones, caching, being polite to free services.
  - Done when: over 99% of outdoor and open-roof games have weather, the Dec 10, 2017 Colts–Bills snow game shows snowfall, and temperatures broadly agree with nflverse's `temp` column.
- [x] **1.7 Load play-by-play, 2016 to present.** Four sub-steps:
  - 1.7a In a notebook, choose the 40–60 columns you need.
  - 1.7b Load one season and check its row count.
  - 1.7c Load all seasons and check the table size with `pg_total_relation_size`.
  - 1.7d Add indexes on `game_id` and `(season, posteam)`.
  - Learn: indexes; storage budgets.
  - Done when: every play-by-play `game_id` exists in schedules and the table leaves plenty of Neon headroom.
- [x] **1.8 One command runs it all.** For example `uv run python -m pipeline ingest`; by default it reloads only the current season.
  - Learn: entry points; incremental vs full loads; logging.
  - Done when: one command loads everything and a second run changes nothing.
- [x] **1.9 Write data checks.** pytest checks for row counts, duplicate keys, weather coverage and orphan games.
  - Learn: data-quality testing.
  - Done when: the checks pass, and fail when you break one on purpose.
- [x] **1.10 Load production.** Run the full ingest against Neon.
  - Done when: Neon's dashboard shows storage well under 1 GB.

Checkpoint: you can explain ELT, upserts and idempotency.

## Phase 2 — Transformation with dbt

Goal: one `team_games` table with a row per team per game, carrying every situation and stat, plus summary tables the website reads.

- [x] **2.1 Feel the problem first.** By hand, write a query for each team's 2025 home and away average margin from `raw.schedules`.
  - Learn: why each game must become two rows, one per team (long format), using `UNION ALL`.
  - Done when: 64 rows come back (32 teams × home and away).
- [x] **2.2 Set up dbt.** Add `dbt-postgres` (stable 1.x), run `dbt init` in `transform/`, read credentials from environment variables.
  - Learn: models, `ref()`, sources, materializations (view vs table).
  - Done when: `dbt debug` passes.
- [x] **2.3 Seeds and sources.** Load the stadiums CSV with `dbt seed`; declare the raw tables in `sources.yml`.
  - Done when: `dbt seed` loads the stadiums and `dbt ls` lists the sources.
- [x] **2.4 Staging models.** One `stg_` model per raw table: rename columns, fix types, standardise team codes, build `kickoff_utc`.
  - Learn: the staging layer; casting; `AT TIME ZONE`.
  - Done when: `dbt build` passes `unique` and `not_null` tests on every key.
- [x] **2.5 The games model.** One row per game joining schedules, stadiums and weather, with game-level situations: roof, surface, temperature, precipitation and wind buckets, time slot, primetime, opponent type, neutral site.
  - Learn: `CASE WHEN` bucketing; `accepted_values` tests.
  - Done when: the row count equals schedules and every bucket column passes its test.
- [x] **2.6 The team_games model.** Two rows per game: is_home, points for and against, result, rest days, rest difference, and the spread from that team's side.
  - Learn: flipping perspective; sign conventions (check one spread against a game you know).
  - Done when: a test confirms exactly two rows per `game_id`.
- [x] **2.7 Travel and body-clock features.** Each team's home stadium per season; time zones crossed and direction at kickoff; kickoff hour in the visiting team's zone; travel distance.
  - Learn: time-zone arithmetic; the haversine distance formula in SQL.
  - Done when: a Seattle road game at 1:00 pm ET shows a 10:00 am body clock and 3 zones eastbound, and an Arizona–Rams game shows 0 zones in October and 1 in December.
- [x] **2.8 Game stats from play-by-play.** One row per team per game: plays, EPA/play on offense and defense, success rate, yards/play, pass rate, turnovers, sacks, 3rd-down %, red-zone TD %, penalties.
  - Learn: aggregation; filtering to real plays (no kneels or spikes); a team's defense is its opponent's offense.
  - Done when: one game's yards and turnovers match its official box score.
- [x] **2.9 Form features with window functions.** Previous result, win/loss streak, after a blowout loss, games since bye, consecutive road games. These feed the v1.1 situations and the models.
  - Learn: `LAG`, `ROW_NUMBER`, `PARTITION BY` — staple interview topics.
  - Done when: one team's full season reads correctly row by row.
- [ ] **2.10 Situation registry.** A `situations.csv` seed: key, label, category, column, values, description, `in_v1`.
  - Learn: config-driven design: the website builds its filters from this table, so a new situation needs no new page code.
  - Done when: all 12 v1 situations are listed and each column exists in `team_games`.
- [ ] **2.11 Split marts.** `mart_team_splits` and `mart_league_splits` per season per situation value, storing sums and counts rather than averages.
  - Learn: additive measures. An average of averages is wrong; summed totals divided by summed counts over any season range is right.
  - Done when: league home win % by season shows the 2020 dip.
- [ ] **2.12 Tests and docs.** Fill test gaps; run `dbt docs generate` and look at the lineage graph.
  - Done when: `dbt build` passes end to end.
- [ ] **2.13 Build in production.** Run `dbt build` against Neon.
  - Done when: the marts exist in Neon and storage is still under budget.

Checkpoint: you can explain staging vs marts, long format, window functions and additive measures.

## Phase 3 — Exploratory analysis

Goal: find out which situations actually matter before building pages around them. This phase also produces the write-up for your portfolio.

- [ ] **3.1 Notebook setup.** Add `jupyter`, `pandas` and `matplotlib`; write a helper that reads a mart into pandas.
  - Done when: a notebook plots games per season.
- [ ] **3.2 Sanity checks against known facts.** League home win % and average margin by season; points per game by season.
  - Done when: your numbers match published figures, e.g. home teams finishing below .500 in 2020.
- [ ] **3.3 League-wide situation effects.** For each v1 situation: margin, EPA/play and total points against the league baseline, with n and a 95% confidence interval.
  - Learn: standard error and confidence intervals.
  - Done when: one chart per situation family, each with error bars.
- [ ] **3.4 The big questions.** Does yard differential predict wins? Is offensive or defensive EPA more predictive of win %? Which is more stable from one season to the next?
  - Learn: correlation, simple regression, R².
  - Done when: each question has a one-paragraph answer and a chart.
- [ ] **3.5 Small samples and noise.** Shuffle situation labels at random and count how many "significant" team splits appear anyway; compare raw team splits with shrunk ones.
  - Learn: multiple comparisons, regression to the mean, shrinkage.
  - Done when: you can show why a team's 2–0 record in the rain means little.
- [ ] **3.6 Write up the findings.** `docs/findings.md`: what matters, what doesn't, which situations to feature.
  - Done when: the v1 situation list is confirmed or trimmed on evidence.

Checkpoint: you can present one finding the way you would in an interview: question, method, result, caveat.

## Phase 4 — Frontend MVP

Goal: four views (team pages, situation explorer, leaderboards, this week) that read only from the marts.

- [ ] **4.1 Data access layer.** Install Drizzle; run `drizzle-kit pull` to generate types from the marts; keep all queries in `lib/queries.ts`. Restrict `web_reader` to `marts`.
  - Learn: introspection; typed queries.
  - Done when: a typed query renders `mart_team_splits` rows on a page.
- [ ] **4.2 App shell.** Layout, navigation, shadcn/ui, and an nflverse and Open-Meteo credit in the footer.
  - Done when: every route shares the layout at desktop and phone widths.
- [ ] **4.3 Teams index.** 32 teams grouped by division, with logos and colours from a `dim_teams` mart (a small dbt model over `raw.teams`).
  - Done when: each team links to its team page.
- [ ] **4.4 Team page: record.** Header plus a season-by-season record.
  - Done when: one team's records match an official source.
- [ ] **4.5 Team page: splits table.** Every v1 situation against the league average, with n; a season-range selector kept in the URL (`?from=2024&to=2026`).
  - Learn: URL search params as state; shareable views.
  - Done when: changing the range changes the numbers, and pasting the URL reproduces the view.
- [ ] **4.6 Team page: split charts.** Bar charts of margin by situation value, with n shown.
  - Done when: charts read correctly in light and dark mode.
- [ ] **4.7 Situation explorer.** Stack filters (e.g. outdoors + 15+ mph wind + away) and see league and team results.
  - Learn: building SQL safely: columns only from the situation registry, values passed as parameters (SQL injection).
  - Done when: any filter combination works and an unknown column in the URL is rejected.
- [ ] **4.8 Leaderboards.** Best and worst teams per situation, with a minimum-games threshold.
  - Done when: teams below the threshold are hidden or greyed out.
- [ ] **4.9 This week.** Upcoming games with the v1 situations that apply to each side (forecast weather arrives in 5.4).
  - Done when: next week's games show their situations correctly.
- [ ] **4.10 States and polish.** Loading, empty and error states; page titles and descriptions.
  - Done when: a bad team code shows a proper 404 page.
- [ ] **4.11 Caching.** Cache pages; add a secret-protected route that refreshes them on demand.
  - Learn: static vs dynamic rendering; revalidation.
  - Done when: repeat visits are fast and calling the route refreshes the data.

Checkpoint: you can trace any number on a page back to the SQL that produced it.

## Phase 5 — Automation

Goal: the site refreshes itself every day of the season with no manual work.

- [ ] **5.1 Manual workflow.** A GitHub Actions workflow with a Run button (`workflow_dispatch`) that runs ingest against Neon using repo secrets.
  - Learn: YAML, runners, secrets.
  - Done when: a green run appears in the Actions tab.
- [ ] **5.2 Add dbt.** The workflow runs `dbt build` after ingest and fails if any test fails.
  - Done when: a deliberately broken test turns the run red.
- [ ] **5.3 Schedule it.** A daily cron during the season, written in UTC.
  - Learn: cron syntax; UTC vs Eastern time.
  - Done when: a scheduled run fires on its own.
- [ ] **5.4 Forecast weather.** Open-Meteo forecasts for games in the next 16 days into `raw.weather_forecast`; This week shows them.
  - Done when: next week's outdoor games show a forecast.
- [ ] **5.5 Refresh the site.** The workflow's last step calls the refresh route from 4.11.
  - Done when: new data appears on the site without a redeploy.
- [ ] **5.6 Freshness.** A `pipeline_runs` table; the footer shows when data was last updated.
  - Done when: the timestamp changes after each run.
- [ ] **5.7 Pull-request checks.** Lint, type-check and build `web/`; `ruff` on the Python; `dbt compile`.
  - Learn: continuous integration.
  - Done when: a pull request with a type error is blocked.

GitHub turns off scheduled workflows in a public repo after 60 days without activity, so expect to re-enable the schedule each preseason.

Checkpoint: you can explain CI/CD and what happens, step by step, during a nightly run.

## Phase 6 — Predictions

Goal: game predictions made before kickoff, graded after, with a public track record. Matching the betting line is a strong result; beating it consistently is rare.

- [ ] **6.1 Define targets and scoring.** Targets: home win probability, margin and total points, plus each team's projected points, passing yards and rushing yards. Scores: log loss, Brier score, accuracy and mean absolute error.
  - Done when: two baselines are scored on 2023–2025: "the home team always wins" and the betting line's implied probability.
- [ ] **6.2 Feature table.** A dbt model of pre-game features only: rolling EPA from prior games, rest, travel and the v1 situations.
  - Learn: data leakage, and how to test for it.
  - Done when: a test proves no feature uses the game it is predicting.
- [ ] **6.3 Elo ratings.** A simple team-strength rating updated after every game.
  - Done when: Elo's predictions are scored against both baselines.
- [ ] **6.4 Baseline models.** Logistic regression for win probability; linear regression for points and yards. Walk-forward validation: train through season N, test on N+1.
  - Learn: time-based splits; calibration; prediction intervals.
  - Done when: each test season has scores and a calibration plot.
- [ ] **6.5 LightGBM.** Compare with logistic regression; check feature importance.
  - Done when: one table compares every model with the betting-line benchmark.
- [ ] **6.6 Publish predictions.** A predict script writes a `predictions` table with model version and creation time, before kickoff. Every points or yards projection carries an 80% range.
  - Done when: next week's predictions are stored with timestamps before their kickoffs.
- [ ] **6.7 Grade predictions.** After games, score each prediction into a track-record table.
  - Done when: last week's predictions are graded automatically.
- [ ] **6.8 Show them.** Predictions on This week, plus a track-record page.
  - Done when: both pages read from the tables, not from hard-coded values.
- [ ] **6.9 Automate.** Weekly retrain, plus daily predict and grade, in the workflow.
  - Done when: a full week passes with no manual steps.
- [ ] **6.10 Backtest against the spread.** Using the walk-forward predictions from 6.4–6.5: if you had taken the model's side whenever it disagreed with the closing spread by 2+ points, what was its against-the-spread record each season?
  - Learn: break-even at standard −110 pricing is 52.4%; confidence intervals on a win rate; why the closing line is a tough benchmark.
  - Done when: a table shows ATS record, win % with a 95% confidence interval, and hypothetical ROI per season.

Checkpoint: you can explain leakage, walk-forward validation and calibration, and why the betting line is the benchmark.

## Phase 7 — Portfolio polish, then what's next

Goal: an employer understands the project in five minutes.

- [ ] **7.1 README.** Architecture diagram, stack, how to run it locally, data sources and credits.
- [ ] **7.2 Methodology page.** On the site: EPA, success rate, how situations are defined, confidence intervals, the model.
- [ ] **7.3 Analysis write-up.** The Phase 3 findings as a blog post or portfolio page.
- [ ] **7.4 Domain.** Point a subdomain of your portfolio site at Vercel.
- [ ] **7.5 Portfolio and resume.** Add the project to your portfolio; draft three resume bullets with numbers in them.

**After the MVP**

- v1.1 situations: travel distance, altitude, consecutive road games, after a win or loss, streaks, opponent quality, starting-QB changes, first-year head coach, international games.
- Player-level analytics.
- On-demand "what-if" predictions through a small FastAPI service.

**Sources**

- [nflreadr schedules data dictionary](https://cloud.r-project.org/web/packages/nflreadr/vignettes/dictionary_schedules.html)
- [Neon free plan doubles storage to 1 GB (releases digest)](https://releases.sh/collections/serverless-postgres/digest/2026-09-28)
- [Neon pricing](https://neon.com/pricing)
- [dbt Labs + Fivetran merger announcement](https://www.getdbt.com/blog/dbt-labs-and-fivetran-merge-announcement)
- [Home teams' losing record in 2020 (AP via The Atlanta Journal-Constitution)](https://www.pressreader.com/usa/the-atlanta-journal-constitution/20211111/281900186450631)
- [Open-Meteo free tier terms (summary)](https://apify.com/aurenic/open-meteo-scraper.md)
