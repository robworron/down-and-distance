# Down & Distance

A public NFL situational-analytics site. Python batch jobs load data into PostgreSQL, dbt transforms it with SQL, and a Next.js site on Vercel reads the results.

The full plan and step checklist is `docs/build-plan.md`. Read the current step there before starting any work. Do not import that file; open it when needed.

Before starting a phase, read `docs/decisions.md`: it logs every place we deviated from the plan, and it wins where the two disagree.

## Who you're working with

Rob is an honours CS grad, fluent in Next.js/React/TypeScript/Tailwind, with basic Python, moving into data analyst work. Claude Code writes all code, including SQL and analysis. Explain new tools and concepts in plain English as you introduce them. After any SQL- or analysis-heavy step, walk Rob through what was built clause by clause, so he can explain it in interviews.

## How we work

- Work through `docs/build-plan.md` in order, one step at a time.
- Before writing code for a step, explain what the step does and the concept behind it in 2–4 plain sentences.
- After each step:
  1. Run its "Done when" check and show the result.
  2. Commit with a message starting with the step number, e.g. `1.4: load teams`, and push.
  3. Tick the step's box in `docs/build-plan.md` (same commit).
- Never start a step while the previous step's "Done when" check fails.
- Keep changes inside the current step. Ideas for later go in `docs/parking-lot.md`, not into the code.

## Stop and hand back to Rob when

- A step needs his accounts or secrets: creating Neon, Vercel or GitHub resources, connection strings, repo secrets. Say exactly what to click or copy, then wait.
- A phase ends. Summarise what was built and list the checkpoint concepts from the plan.
- The same error survives two fix attempts. Stop and explain what you tried and what you think is wrong.
- An action would delete data, rewrite git history, or change production (Neon, Vercel) beyond what the step says.
- A step needs a judgment call the plan doesn't settle (bucket definitions, data corrections, scope changes). Present the options with counts and a recommendation, then wait.

## Environment

- Windows 10 Pro, Claude Code desktop app, native Windows (not WSL). Use Git Bash for commands; PowerShell only for Windows-specific tasks.
- Local Postgres 18 runs in Docker: `docker compose up -d`, on host port **15432** (Windows/WinNAT reserves 5427–5526, which covers 5432 and 5433). Production database is Neon (also Postgres 18); the site deploys to Vercel from `main`.
- Python: always through uv (`uv add`, `uv run`). Never use global `pip install`. Python 3.13 is pinned in `.python-version` (dbt compatibility); don't move to 3.14.
- `.env` holds three connection strings:
  - `DATABASE_URL`: local Docker Postgres as owner. The default for every pipeline and dbt run, and copied into `web/.env.local` for the local site.
  - `NEON_DATABASE_URL`: Neon owner role, direct (unpooled) host. Use only for production loads and admin, by setting `DATABASE_URL` to it for that one command.
  - `WEB_READER_DATABASE_URL`: Neon `web_reader` role, pooled (`-pooler`) host, read-only. This is Vercel's `DATABASE_URL`; written by `pipeline/create_web_reader.py` (rerunning rotates the password, so Vercel must be updated after).
- Node is used only inside `web/`.
- Line endings are LF (`.gitattributes`). Use forward slashes in paths inside code and config.
- Secrets live in `.env` (gitignored). Keep `.env.example` in sync with variable names only. Never print or commit secret values.

## Commands

Run from the repo root unless noted. Anything local needs Docker Desktop running.

- **Load data:** `uv run python -m pipeline ingest` loads the current season into every raw table (the nightly job). Flags:
  - `--full`: every season each table covers (schedules 1999-, weather 2000-, play-by-play 2016-).
  - `--seasons 2020-2022`: chosen seasons; also `2025` or `2016,2018-2020`. Can't be combined with `--full`.
  - `--only schedules,teams,weather,pbp`: a subset, still loaded in that order.
  
  Loads are idempotent upserts, so reruns are safe. For production, set `DATABASE_URL` to `NEON_DATABASE_URL` for that one command, without echoing it.
- **dbt:** `uv run python -m pipeline dbt <command>` (e.g. `build`, `seed`, `debug`, `ls`) runs dbt in `transform/` against `DATABASE_URL`: `pipeline/run_dbt.py` splits the URL into the `DBT_*` variables `transform/profiles.yml` reads. Don't run `dbt` directly. For production, set `DATABASE_URL` to Neon for that one command, as with ingest.
- **Weather cache:** `pipeline/.cache/open-meteo/` (gitignored). Without it, a `--full` run refetches about 6,000 games (around 90 minutes, paced to Open-Meteo's free tier).
- **Tests:** `uv run pytest` runs everything. Against Neon, run only the data checks: `uv run pytest pipeline/tests/test_raw_data.py`.
- **`local_only` marker:** `test_upsert.py` creates and drops throwaway schemas. It is marked `local_only` and skips itself unless `DATABASE_URL` is the local database (`is_local_database()` in `pipeline/db.py`). Give any new test that writes to the database the same marker and skip.
- **SQL checks:** `pipeline/sql/checks/*.sql` are SQL checks: Done-when queries commented clause by clause. Rob runs them in DBeaver against local Postgres; `test_raw_data.py` runs them too. Put new SQL checks there in the same style.
- **dbt docs:** `uv run python -m pipeline dbt docs generate`, then the `dbt-docs` preview in `.claude/launch.json` (http://localhost:8080; a threaded static server, because `dbt docs serve` hangs in the browser pane). Describe every new model and column in the YAML; shared columns use docs blocks in `transform/models/_docs.md`.
- **Stadium seed:** `uv run python -m pipeline.validate_stadiums` checks `transform/seeds/stadiums.csv`. Add `--fill-altitude` after adding a stadium.
- **Local website:** `web/.env.local` holds one line, `DATABASE_URL=`, with the same local URL as `.env` (Next.js reads env files only from `web/`). It is gitignored, so create it on a fresh clone. In `web/`: `npm ci`, then `npm run dev` (or the `web` preview in `.claude/launch.json`), `npm run build` and `npm run lint`.
- **Notebooks:** `notebooks/`, read from the local marts through `pipeline/analysis.py` (`read_mart`, `regular_season`, `save_figure` to `docs/figures/`). Phase 3 follows the analysis rules in `docs/decisions.md`. Run one headless, as each step's Done-when check: `uv run jupyter nbconvert --to notebook --execute --inplace notebooks/<name>.ipynb`; its final `assert` cells are the check. Commit notebooks with their outputs.
- **Reference:** `docs/data-model.md` describes every table, its checks and the Phase 2 weather rules.

## Project layout

- `pipeline/` Python: ingestion, weather, ML training and predictions. Tests in `pipeline/tests/`.
- `transform/` dbt project: `seeds/`, `models/staging/`, `models/marts/`.
- `web/` Next.js App Router app. All database queries live in `web/lib/queries.ts`.
- `notebooks/` Jupyter analysis. `docs/` plan, data model, findings, methodology.
- Database schemas: `raw` (loaded by Python), `staging` and `marts` (built by dbt). The website connects as the read-only `web_reader` role and reads `marts` only.

## Data

- nflverse via `nflreadpy`. Do not use the deprecated `nfl_data_py`.
- nflreadpy returns Polars, so convert to pandas immediately with `.to_pandas()` after every load and use pandas everywhere else. Never write Polars code. Polars stays installed only as nflreadpy's dependency.
- Schedules: 1999 to present. Play-by-play: 2016 to present, trimmed to the columns listed in `docs/data-model.md`.
- Weather: Open-Meteo archive API (history) and forecast API (upcoming games), using coordinates from `transform/seeds/stadiums.csv`. Cache responses to disk. `raw.game_weather` stores the kickoff hour and a 3-hour game window. Phase 2 buckets use the window, give closed-roof games no weather, and bucket precipitation by intensity rather than exact amount (`docs/decisions.md`).
- nflverse `gametime` is Eastern time. Convert with IANA zone names (e.g. `America/Phoenix`), never fixed offsets.
- 2020 is flagged and excluded by default from home/away splits. Seasons before 2021 have 16 games, so compare per-game rates.

## Conventions

- Loads are idempotent: upsert on primary keys; a second run changes nothing.
- Transformations are SQL in dbt, not Python. Python moves data and does statistics and ML.
- Marts store sums and counts, never pre-computed averages, so any season range re-aggregates correctly.
- Every split shown on the site includes its number of games (n).
- Prediction features use only information available before kickoff. Validate models walk-forward by season.
- Build SQL in the web app with parameters; filter columns must come from the situation registry (`situations.csv`).
- Credit nflverse and Open-Meteo in the site footer. No NFL or team trademarks in the project's name or branding.
