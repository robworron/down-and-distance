# Down & Distance

A public NFL situational-analytics site. Python batch jobs load data into PostgreSQL, dbt transforms it with SQL, and a Next.js site on Vercel reads the results.

The full plan and step checklist is `docs/build-plan.md`. Read the current step there before starting any work. Do not import that file; open it when needed.

## Who you're working with

Rob is an honours CS grad, fluent in Next.js/React/TypeScript/Tailwind, with basic Python. He is moving into data analyst work, so SQL, statistics and analysis are the skills he wants to build himself. Explain new tools and concepts in plain English as you introduce them.

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

- A step is marked **You try first** (SQL, statistics, analysis). Explain the goal and the concepts, give hints only if he asks, and wait for his attempt. Review it; write the solution only if he asks.
- A step needs his accounts or secrets: creating Neon, Vercel or GitHub resources, connection strings, repo secrets. Say exactly what to click or copy, then wait.
- A phase ends. Summarise what was built and list the checkpoint concepts from the plan.
- The same error survives two fix attempts. Stop and explain what you tried and what you think is wrong.
- An action would delete data, rewrite git history, or change production (Neon, Vercel) beyond what the step says.

## Environment

- Windows 10 Pro, Claude Code desktop app, native Windows (not WSL). Use Git Bash for commands; PowerShell only for Windows-specific tasks.
- Local Postgres runs in Docker: `docker compose up -d`. Production database is Neon; the site deploys to Vercel from `main`.
- Python: always through uv (`uv add`, `uv run`). Never use global `pip install`.
- Node is used only inside `web/`.
- Line endings are LF (`.gitattributes`). Use forward slashes in paths inside code and config.
- Secrets live in `.env` (gitignored). Keep `.env.example` in sync with variable names only. Never print or commit secret values.

## Project layout

- `pipeline/` Python: ingestion, weather, ML training and predictions. Tests in `pipeline/tests/`.
- `transform/` dbt project: `seeds/`, `models/staging/`, `models/marts/`.
- `web/` Next.js App Router app. All database queries live in `web/lib/queries.ts`.
- `notebooks/` Jupyter analysis. `docs/` plan, data model, findings, methodology.
- Database schemas: `raw` (loaded by Python), `staging` and `marts` (built by dbt). The website connects as the read-only `web_reader` role and reads `marts` only.

## Data

- nflverse via `nflreadpy` (returns Polars; use `.to_pandas()` in notebooks). Do not use the deprecated `nfl_data_py`.
- Schedules: 1999 to present. Play-by-play: 2016 to present, trimmed to the columns listed in `docs/data-model.md`.
- Weather: Open-Meteo archive API (history) and forecast API (upcoming games), at the kickoff hour, using coordinates from `transform/seeds/stadiums.csv`. Cache responses to disk.
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
