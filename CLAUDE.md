# Down & Distance

A public fantasy football research application, with team-level NFL research alongside it. Python batch jobs load data into PostgreSQL, dbt transforms it with SQL, and a Next.js site on Vercel reads the results. Phase 0 of the build plan (the data pipeline, dbt warehouse, team analysis and team research pages) is built; the fantasy features (Phases 1–7) are planned.

The full plan and step checklist is `docs/build-plan.md`. Read the current step there before starting any work. Do not import that file; open it when needed. The product requirements are `docs/requirements.md`. Step numbers in older code comments may not match the build plan; the build plan's numbering is current.

Before starting a phase, read `docs/decisions.md`: the decision record, grouped by area. It wins where it and the plan disagree.

## Who you're working with

Rob is an honours CS grad, fluent in Next.js/React/TypeScript/Tailwind, with basic Python, moving into data analyst work. Claude Code writes all code, including SQL and analysis. Explain new tools and concepts in plain English as you introduce them. After any SQL- or analysis-heavy step, walk Rob through what was built clause by clause, so he can explain it in interviews.

## How we work

- Work through `docs/build-plan.md` in order, one step at a time.
- **A session works only on the steps it was scoped to.** When those steps are done (Done-when passed, committed, pushed, production checked), stop and hand back. Never start an unplanned step, not even to look at what it needs: planning the next steps happens in a new session, which agrees the plan with Rob and saves it in `docs/plans/` before any code.
- Before writing code for a step, explain what the step does and the concept behind it in 2–4 plain sentences.
- After each step:
  1. Run its "Done when" check and show the result.
  2. Commit with a message starting with the step label, e.g. `2.3: load weekly player stats`, and push.
  3. Tick the step's box in `docs/build-plan.md` (same commit). When part of the Done-when can only be checked after the push (a GitHub run, the live site, Neon), the box is ticked with that evidence in one docs-only follow-up commit, `x.y: record checks`, once every check passes (`docs/decisions.md`, 2026-10-21).
- Never start a step while the previous step's "Done when" check fails.
- Keep changes inside the current step. Ideas for later go in `docs/parking-lot.md`, not into the code.
- If a website shows a bot check or blocks automated access, don't try other ways to fetch it (another tool, URL or request). Switch to another source, and say which.

## Stop and hand back to Rob when

- A step needs his accounts or secrets: creating Neon, Vercel or GitHub resources, connection strings, repo secrets. Say exactly what to click or copy, then wait.
- A phase ends. Summarise what was built and list the checkpoint concepts from the plan.
- The same error survives two fix attempts. Stop and explain what you tried and what you think is wrong.
- An action would delete data, rewrite git history, or change production (Neon, Vercel) beyond what the step says.
- A step needs a judgment call the plan doesn't settle (bucket definitions, data corrections, scope changes). Present the options with counts and a recommendation, then wait.

## Environment

- Windows 10 Pro, Claude Code desktop app, native Windows (not WSL). Use Git Bash for commands; PowerShell only for Windows-specific tasks.
- Local Postgres 18 runs in Docker: `docker compose up -d`, on host port **15432** (Windows/WinNAT reserves 5427–5526, which covers 5432 and 5433). Production database is Neon (also Postgres 18); the site deploys to Vercel from `main`, live at **https://down-and-distance-chi.vercel.app/** (not `down-and-distance.vercel.app`, which is someone else's project).
- Python: always through uv (`uv add`, `uv run`). Never use global `pip install`. Python 3.13 is pinned in `.python-version` (dbt compatibility); don't move to 3.14.
- `.env` holds three connection strings:
  - `DATABASE_URL`: local Docker Postgres as owner. The default for every pipeline and dbt run, and copied into `web/.env.local` for the local site.
  - `NEON_DATABASE_URL`: Neon owner role, direct (unpooled) host. Use only for production loads and admin, by setting `DATABASE_URL` to it for that one command.
  - `WEB_READER_DATABASE_URL`: Neon `web_reader` role, pooled (`-pooler`) host, read-only. This is Vercel's `DATABASE_URL`; written by `pipeline/create_web_reader.py` (a plain rerun rotates the password, so Vercel must be updated after). Flags: `--keep-password` reapplies the grants without rotating; `--grant-only` applies only `web_reader.sql` (the "expand" half of a grant change); `--check` connects as `web_reader` and reports what it can read and write, changing nothing.
- Node is used only inside `web/`.
- Line endings are LF (`.gitattributes`). Use forward slashes in paths inside code and config.
- Secrets live in `.env` (gitignored). Keep `.env.example` in sync with variable names only. Never print or commit secret values.

## Commands

Run from the repo root unless noted. Anything local needs Docker Desktop running.

- **Load data:** `uv run python -m pipeline ingest` loads the current season into every raw table (the nightly job). Flags:
  - `--full`: every season each table covers (schedules 1999-, weather 2000-, play-by-play 2016-).
  - `--seasons 2020-2022`: chosen seasons; also `2025` or `2016,2018-2020`. Can't be combined with `--full`.
  - `--only schedules,teams,weather,pbp`: a subset, still loaded in that order.
  
  Loads are idempotent upserts, so reruns are safe. For production, set `DATABASE_URL` to `NEON_DATABASE_URL` for that one command, without echoing it. Don't `source .env` in Bash for this: the Neon URLs contain `&`, which truncates the value. Set it from Python (`dotenv_values`) and run the module with `runpy`.
- **dbt:** `uv run python -m pipeline dbt <command>` (e.g. `build`, `seed`, `debug`, `ls`) runs dbt in `transform/` against `DATABASE_URL`: `pipeline/run_dbt.py` splits the URL into the `DBT_*` variables `transform/profiles.yml` reads. Don't run `dbt` directly. For production, set `DATABASE_URL` to Neon for that one command, as with ingest.
- **Weather cache:** `pipeline/.cache/open-meteo/` (gitignored). Without it, a `--full` run refetches about 6,000 games (around 90 minutes, paced to Open-Meteo's free tier).
- **Tests:** `uv run pytest` runs everything. Against Neon, run only the data checks: `uv run pytest pipeline/tests/test_raw_data.py`. Web unit tests (pure functions in `web/lib`, e.g. badge contrast): `npm test` in `web/` (Vitest).
- **`local_only` marker:** `test_upsert.py` creates and drops throwaway schemas. It is marked `local_only` and skips itself unless `DATABASE_URL` is the local database (`is_local_database()` in `pipeline/db.py`). Give any new test that writes to the database the same marker and skip.
- **SQL checks:** `pipeline/sql/checks/*.sql` are SQL checks: Done-when queries commented clause by clause. Rob runs them in DBeaver against local Postgres; `test_raw_data.py` runs them too. Put new SQL checks there in the same style.
- **dbt docs:** `uv run python -m pipeline dbt docs generate`, then the `dbt-docs` preview in `.claude/launch.json` (http://localhost:8080; a threaded static server, because `dbt docs serve` hangs in the browser pane). Describe every new model and column in the YAML; shared columns use docs blocks in `transform/models/_docs.md`.
- **Stadium seed:** `uv run python -m pipeline.validate_stadiums` checks `transform/seeds/stadiums.csv`. Add `--fill-altitude` after adding a stadium.
- **Local website:** `web/.env.local` holds one line, `DATABASE_URL=`, with the same local URL as `.env` (Next.js reads env files only from `web/`). It is gitignored, so create it on a fresh clone. In `web/`: `npm ci`, then `npm run dev` (or the `web` preview in `.claude/launch.json`), `npm run build` and `npm run lint`.
- **Drizzle types:** `npm run db:pull` in `web/` introspects the local `marts` schema into `web/drizzle/schema.ts` (committed, never edited by hand). Rerun it after any dbt change to a table the site reads. dbt owns the schema: never run `drizzle-kit push`, `generate` or `migrate`. In development, Drizzle logs every query's SQL and parameters to the dev server's output.
- **Design system:** colour roles live as CSS variables in `web/app/globals.css`, light and dark; use the role (`text-ink-2`, `bg-card`, `var(--bar)`), never a hex. shadcn/ui components go in `web/components/ui/` (`npx shadcn@latest add <name>`; add only what a page uses). The approved design and its rules are in `docs/decisions.md` (2026-10-19). Site text is plain language: never name internal phases or steps on a page.
- **Screenshots:** the browser pane scales wide viewports down, and while hidden it pauses the animation frames React uses to reveal streamed (Suspense) content. For full-size checks run headless Chrome (`--headless=new --screenshot`, `--force-dark-mode` for dark), and frame phone widths in a 375–390 px iframe. Keep screenshot files out of the repo.
- **Production changes the site depends on** (grants, new marts or columns) go expand → deploy → contract: add the new on Neon, deploy the code that uses it, then remove the old, so the live site never errors. Stop for Rob before each Neon step.
- **Notebooks:** `notebooks/02`–`06` are the team situation analysis (01 is the play-by-play column choice); notebooks 07–10 (steps 2.1 and 4.2–4.4) cover the player sources and analysis. They read the local marts, so run `dbt build` first.
  - **Re-run one headless:** `uv run jupyter nbconvert --to notebook --execute --inplace notebooks/<name>.ipynb`. Its final `assert` cells are the step's Done-when check, and the answer paragraphs are generated from the computed numbers under asserts, so a failed run means a claim no longer holds. 04 and 06 take about a minute each. Commit notebooks with their outputs.
  - **Reproducible:** bootstraps and shuffles use fixed seeds (`SEED`, `N_RESAMPLES` in `pipeline/analysis.py`), so a re-run gives the same numbers.
  - **`pipeline/analysis.py`** is the notebooks' shared helper module, unit-tested in `pipeline/tests/test_analysis.py`:
    - reading the marts: `read_mart` (bound parameters only) and `regular_season`, with the season constants;
    - the game bootstrap: `resample_weights`, `stratum_means`, `bucket_mean`, `summarize`;
    - tests and controls: `bh_adjust`, `fisher_p_table`, `leave_one_out_strength`;
    - charts: `chart_style` and `save_figure`.
  - **Figures:** `save_figure` writes `docs/figures/<name>.png`, which `docs/findings.md` and the later README and write-up embed. Load the `dataviz` skill before writing chart code.
  - **The analysis rules** (seasons, baselines, the keep rule) and their dated amendments are in `docs/decisions.md`. Notebooks 04 and 06 pin the 13 pre-registered situations (`PHASE3_SITUATIONS`), so later registry rows don't change them.
- **Reference:**
  - `docs/plans/` holds detailed plans agreed for upcoming steps, linked from the build plan. `phase-1.md` is the agreed plan for Phase 1 (steps 1.1–1.6), and `states-and-caching.md` the agreed design for steps 1.4 and 1.5. Read the current plan before starting its step; `decisions.md` still wins where they disagree.
  - `docs/data-model.md` describes every table, its checks and the weather rules.
  - `docs/findings.md` holds the team situation analysis and the v1 situation verdicts: which situations are featured, which are filters, which were trimmed (`in_v1` false in `transform/seeds/situations.csv`).

## Project layout

- `pipeline/` Python: ingestion, weather and analysis helpers; player loaders, run records and projections are planned (step 1.6, Phases 2 and 6). Tests in `pipeline/tests/`.
- `transform/` dbt project: `seeds/`, `models/staging/`, `models/marts/`.
- `web/` Next.js App Router app. All database queries live in `web/lib/queries.ts` (split by domain into `web/lib/queries/` in step 5.1).
- `notebooks/` Jupyter analysis. `docs/` build plan, requirements, decisions, data model, findings.
- Database schemas: `raw` (loaded by Python), `staging` and `marts` (built by dbt). The website connects as the read-only `web_reader` role and reads `marts` only.

## Data

- nflverse via `nflreadpy`. Do not use the deprecated `nfl_data_py`.
- nflreadpy returns Polars, so convert to pandas immediately with `.to_pandas()` after every load and use pandas everywhere else. Never write Polars code. Polars stays installed only as nflreadpy's dependency.
- Schedules: 1999 to present. Play-by-play: 2016 to present, trimmed to the columns listed in `docs/data-model.md`.
- Player data (planned, Phase 2): weekly player stats, players, weekly rosters and snap counts, 2016 to present, keyed by GSIS `player_id`; never join on names. The verified coverage, keys and quirks are in the build plan's "Data sources" section.
- Weather: Open-Meteo archive API (history) and forecast API (upcoming games), using coordinates from `transform/seeds/stadiums.csv`. Cache responses to disk. `raw.game_weather` stores the kickoff hour and a 3-hour game window. The warehouse buckets use the window, give closed-roof games no weather, and bucket precipitation by intensity rather than exact amount (`docs/decisions.md`).
- nflverse `gametime` is Eastern time. Convert with IANA zone names (e.g. `America/Phoenix`), never fixed offsets.
- 2020 is flagged and excluded by default from home/away splits. Seasons before 2021 have 16 games, so compare per-game rates.

## Conventions

- Loads are idempotent: upsert on primary keys; a second run changes nothing.
- Transformations are SQL in dbt, not Python. Python moves data and does statistics and ML.
- Marts store sums and counts, never pre-computed averages, so any season range re-aggregates correctly.
- Every split shown on the site includes its number of games (n).
- Prediction features use only information available before kickoff. Validate models walk-forward by season.
- Build SQL in the web app with parameters; on the research pages, filter columns must come from the situation registry (`situations.csv`).
- Credit nflverse and Open-Meteo in the site footer. No NFL or team trademarks in the project's name or branding.
