# Phase 2 handoff

**Written:** 2026-10-23, at the end of the session that built and verified Phase 1.
**For:** the next Claude Code session, which plans Phase 2 (player data) with Rob.
**Status:** Phase 1 is complete. **Phase 2 is planned, not started:** the agreed plan is `docs/plans/phase-2.md` (2026-10-23). No player code exists, and no player table exists locally or on Neon. Sections A–F below are the planning session's starting point. Where their figures differ from the plan's (e.g. the 536 placeholder rows, the "9 trades"), the plan's re-measured values (X1–X17) win. **Section G** is the checklist for the session that implements step 2.1.

This is an orientation document, not a source of truth. Where it disagrees with another document, the other one wins, in this order:
1. `docs/decisions.md`;
2. `docs/requirements.md` (the product specification);
3. `docs/build-plan.md` (the steps and their Done-when checks);
4. `CLAUDE.md` (commands, environment and working rules).

Each section below links to them rather than repeating them.

## A. Current project state

**The product.** Down & Distance is a free, public fantasy football research site. Each week a manager should be able to see:
- how a player's role is changing (touches, targets, snaps, team shares);
- why his production moved;
- an honest projection with its uncertainty;
- two players side by side.

The fantasy features stand on a finished NFL data foundation:
- nflverse and Open-Meteo pipelines;
- a tested dbt warehouse;
- a pre-registered team situation analysis;
- team research pages.

`docs/requirements.md` §1 has the product definition, and the build plan's "About the project" has a summary.

**Phases.**

| Phase | Status | Evidence |
| --- | --- | --- |
| 0 Foundation | Built, verified 2026-10-21 | `docs/build-plan.md`, Phase 0 |
| 1 Baseline and reliability (1.1–1.6) | **Built, verified 2026-10-23** | `docs/plans/phase-1-verification.md` |
| 2 Player data (2.1–2.7) | **Not started** | `docs/build-plan.md`, Phase 2 |
| 3–7 | Not started | `docs/build-plan.md` |

**Production.**
- **The site:** live at https://down-and-distance-chi.vercel.app/. It is *not* `down-and-distance.vercel.app`, which belongs to someone else. Vercel Hobby deploys from `main`.
- **The database:** Neon Free, Postgres 18.
  - **Production branch:** 234 MB of the 1 GB limit on 2026-10-23. That's raw 188 MB (`raw.pbp` most of it), marts 18 MB, marts_candidate 18 MB, and staging and staging_candidate 120 kB each.
  - **Other branches:** `foundation`, the restore point, and `nightly-test`, the rehearsal target.
- **The nightly job:** `.github/workflows/nightly.yml` runs daily at 09:30 UTC while the repository variable `NIGHTLY_SCHEDULE` is `on`, which it is.

**Phase 1 verification.** Every acceptance criterion passed.
- **The first scheduled run:** [39968873806](https://github.com/robworron/down-and-distance/actions/runs/39968873806) went green on 2026-10-23.
- **The stamp:** the footer stamp advanced on every main page without a redeploy.
- **Status checks:** 18 of 18 pass.
- **Access:** `web_reader` reads marts only.
- **Details:** the full evidence, the defects found and fixed (D-1 to D-4), the outstanding issues (O2–O13) and the checkpoint concepts are in `docs/plans/phase-1-verification.md`.

**Git.**
- **Branch:** `main`, in sync with `origin/main`. The working tree was clean before this handoff.
- **Latest commits:**
  - `51fe474 1.6: record checks`;
  - `055ed1c 1.6: Phase 1 verification, stage A`;
  - `289d06c 1.6: refuse a local database in the nightly job`;
  - then the rest of 1.6 and earlier steps.
- **Recovery checkpoints** (`docs/decisions.md`, 2026-10-21, "Restore points"):
  - the git tag `foundation`;
  - the Neon branch `foundation`;
  - schema dumps from `pipeline.backup_schema` in the gitignored `backups/`.
- **Where to roll back to:** they predate Phase 1, so a rollback of Phase 1 work is a revert of that step's commits rather than the tag.

## B. Existing technical architecture

The full description is the build plan's "Architecture" and "Repo structure" sections, and `docs/data-model.md`. In brief:

**Ingestion (Python, `pipeline/`).** Run with `uv run python -m pipeline ingest [--full | --seasons …] [--only …]`. `CLAUDE.md`, "Commands", has every flag and exit code.

| File | Purpose |
| --- | --- |
| `pipeline/__main__.py` | The CLI. `TABLES` is the load order (schedules, teams, weather, pbp), `RAW_TABLE` maps each to its table, and `REQUIRED = {"schedules"}`. Each table loads on its own. Exit 0 / 1 (an optional table failed) / 2 (a required table failed, or no run records) |
| `pipeline/db.py` | `database_url`, `is_local_database`, `nflverse_to_pandas`, `pg_type`, and `upsert_dataframe`: upsert on the primary key, delete stale rows per season, refuse an empty season |
| `pipeline/load_schedule.py`, `load_teams.py`, `load_weather.py`, `load_pbp.py` | The four loaders. `load_pbp.py` holds `compact()`, which step 2.2 moves into `db.py` |
| `pipeline/runs.py`, `pipeline/sql/run_records.sql` | `RunLog`: `raw.pipeline_runs` and `raw.source_loads`, with a short autocommit connection per write and `sanitize_error` |
| `pipeline/seasons.py` | `current_season`, `parse_seasons` |

**Database schemas.**
- **`raw`:** written by Python; source data kept as-is, with a primary key and `_loaded_at` on every table.
  - Tables: `schedules`, `teams`, `game_weather`, `pbp`, plus the two run-record tables.
- **`staging`:** dbt views and seeds.
- **`marts`:** dbt tables, the only schema the site reads.
  - Tables: `dim_teams`, `dim_stadiums`, `games`, `team_seasons`, `team_game_stats`, `team_games`, `mart_team_splits`, `mart_league_splits`, `data_freshness`, and the `situations` seed.
- **`staging_candidate` and `marts_candidate`:** publish's candidate builds; unreadable by `web_reader`.

**dbt and publishing.**
- **Running dbt:** always through `uv run python -m pipeline dbt <command>`, never plain `dbt`.
- **Publishing:** every production build goes through `uv run python -m pipeline publish` (`pipeline/publish.py`):
  1. SHARE-lock every table in `raw`, read from the catalogue, so a new raw table is covered automatically;
  2. take fingerprint F0;
  3. run the raw gate;
  4. run the full candidate build;
  5. check the lock is still alive;
  6. run the real build;
  7. check F1 = F0 and that the row counts are equal.

  Exit codes 0–5. The guarantees, and what it *doesn't* guarantee, are in `decisions.md` (2026-10-22, "Nightly refresh and run records") and the verification report.
- **Key dbt files:**
  - `transform/macros/current_team.sql` (team relocations);
  - `transform/macros/generate_schema_name.sql` (the candidate suffix);
  - `transform/models/marts/data_freshness.sql` (built last; its `depends_on` comments list every mart);
  - `transform/tests/simulated_failure.sql`.

**CI and the nightly job.**
- **CI:** `.github/workflows/ci.yml`, on every pull request and push to `main`.
  - **What it runs:** ruff, pytest against a throwaway `postgres:18` service, `dbt parse`, ESLint, `next typegen`, `tsc` and Vitest.
  - **What it doesn't do:** it holds no secrets and never touches Neon.
- **The nightly job:** `.github/workflows/nightly.yml`, with a 45-minute limit. Its steps:
  1. the simulation guard;
  2. the target check (`pipeline/check_target.py` refuses a local `DATABASE_URL`);
  3. mart identities;
  4. ingest of the current season;
  5. publish;
  6. a refresh with `--expect-stamp` (production only);
  7. the advisory checks and reports.
- **Environments:** each run uses the GitHub Environment named by its `target` input. `production` is limited to `main`; `test` is the Neon `nightly-test` branch.

**The web app (`web/`).**
- **Stack:** Next.js 16 App Router, Drizzle reads only (`npm run db:pull`; dbt owns the schema), Tailwind, and shadcn/ui.
- **Routes:**
  - `/`;
  - `/teams` and `/teams/[team]`;
  - `/explorer`;
  - `/leaderboards`;
  - `/this-week`;
  - `/api/revalidate`.
- **`web/proxy.ts`:** answers `/teams/<code>` with a 308 to the lower-case URL, or a real 404, from `web/lib/team-codes.json`.
- **Queries:** every database query lives in `web/lib/queries.ts`.

**Caching, revalidation and freshness.**
- **Caching:** every query is `"use cache"` with `martsCache()` (`web/lib/cache.ts`): the `marts` cache profile and the `marts` tag.
- **Revalidation:** `POST /api/revalidate`, with the `REVALIDATE_SECRET` Bearer token (`web/lib/refresh-auth.ts`), expires the tag. `uv run python -m pipeline refresh` calls it and checks the pages.
- **The stamp:** the footer (`web/components/data-updated.tsx`) shows the newest schedules success from `marts.data_freshness`.
- **Further reading:** `docs/plans/states-and-caching.md`, and `decisions.md` (2026-10-22, "Caching and the refresh route").

**Permissions and environments.**
- **The site:** Vercel connects as `web_reader` (read-only, `marts` only, pooled host).
  - Default privileges on `marts` cover new marts automatically.
  - The grants come from `pipeline/sql/web_reader.sql`, through `pipeline/create_web_reader.py` (`--check` reports access and changes nothing).
- **The pipeline:** runs as the Neon owner on the direct (unpooled) host.
- **`.env`:** holds the local URL, the Neon owner URL, the `web_reader` URL and `REVALIDATE_SECRET`. `CLAUDE.md`, "Environment", explains each; `.env.example` lists the names only.

**Local development and tests.**
- **Local stack:** Docker Postgres on port 15432 (`docker compose up -d`).
- **Tests:**
  - `uv run pytest`;
  - `uv run ruff check`;
  - in `web/`: `npm test`, `npm run lint` and `npm run build`, which needs Docker because it prerenders from the database.
- **Marked tests:** tests that write to the database are marked `local_only`, like `pipeline/tests/test_upsert.py`.
- **Checks against Neon:** `pipeline/tests/test_raw_data.py` runs the SQL checks in `pipeline/sql/checks/` against whichever database `DATABASE_URL` names.

## C. Phase 1 decisions Phase 2 must respect

The authoritative text is in `docs/decisions.md`; the headings named here are where to read it.

- **Raw data and ingestion** ("Ingestion"; `docs/data-model.md`, "Raw layer: Conventions"):
  - keep the source as-is in raw (renames and team codes are done in staging);
  - give every table a primary key and `_loaded_at`;
  - make loads idempotent, with stale rows deleted per season and an empty season refused;
  - keep integers as integers;
  - convert nflreadpy output with `.to_pandas()` immediately, and write no Polars code;
  - follow the decisions under "Fantasy application", "Player data: sources, range and identity": 2016 onward, keyed by GSIS `player_id`, never joined on names; every player with an ID kept; play-by-play not reloaded.
  - **Two constraints on new raw tables:**
    - publish's fingerprint reads `_loaded_at`, so every new raw table needs it;
    - the nightly job loads only the current season, inside 45 minutes, so full historical loads are one-off commands.
- **Schemas and dbt** ("Warehouse (dbt)"; the build plan's "Change safety"):
  - additive only: no existing table, mart or column is dropped, renamed or retyped;
  - `dim_players` and `player_*` names are free, but `games` is taken;
  - player models don't read `stg_pbp`;
  - marts store sums and counts, never averages;
  - describe every model and column in the YAML.
- **Candidate publishing** ("Nightly refresh and run records"): production builds only through `pipeline publish`. Required sources gate the build. Late sources are tolerated and shown as pending ("Freshness and partial failure").
- **CI and regression testing** ("Pull-request checks"):
  - keep CI green and run its commands locally before pushing;
  - every data check should fail when broken on purpose;
  - CI never gets secrets.
- **Caching** ("Caching and the refresh route"): any new query is cached with `martsCache()` and takes plain-value arguments. Phase 2 adds no site queries.
- **Production approval boundaries** (`CLAUDE.md`, "Stop and hand back"; the memory note "Expand → deploy → contract"):
  - Stop for Rob before every Neon step, including read-only connections, which are announced first.
  - Production goes expand → deploy → contract.
  - Take a schema backup before any production schema change.
  - Nothing is deleted from Neon without approval, and no failure is ever simulated on production.
  - Rob owns Neon, Vercel and GitHub settings and secrets.
- **Documentation and commits** ("Evidence commits for checks made after the push"):
  - one step per commit, labelled `2.x: …`, with the box ticked in that commit or in a docs-only `2.x: record checks` follow-up when evidence comes after the push;
  - ideas go to `docs/parking-lot.md`;
  - judgment calls go to Rob with counts and a recommendation;
  - a clause-by-clause walkthrough follows every SQL- or analysis-heavy step;
  - a session works only on the steps it was scoped to;
  - the next steps' plan is agreed and saved in `docs/plans/` before any code.
- **Secrets** (`CLAUDE.md`, "Environment"; requirements §0.8):
  - never print, log or commit a connection string, password or token;
  - set `DATABASE_URL` to Neon from Python (`dotenv_values`) for one command, never with `source .env`, because the `&` in the URL truncates it;
  - `sanitize_error` strips URLs from stored errors.

## D. Operational status and known limitations

**The nightly pipeline is running.** The first scheduled run was green on 2026-10-23. No run after it has been checked.

| Item | Detail | Blocks Phase 2? |
| --- | --- | --- |
| **404 page stamp (O2)** | On Vercel, the not-found page's footer stamp isn't replaced by the refresh. On 2026-10-23 at 22:00 UTC it was 27.8 h old (`Age` 100056 s, past the 1-day revalidate), so no bound was observed. The docs-only deploy of `51fe474` did replace it; nothing else is known to. There are no observations from 18:43 on 2026-10-22 to 22:00 on 2026-10-23. The fix options are in `docs/parking-lot.md` | No (stamp on an error page only) |
| **Late schedule (O12)** | GitHub started the first scheduled run about 4 h 51 min after 09:30 UTC. Watch the next runs; the options are in the parking lot | No; but Phase 2's publication timing (stats nightly, rosters 07:00 UTC) should allow for it |
| **Neon storage** | 234 MB of 1 GB. The build plan's player estimate (165–360 MB) predates the candidate build, which keeps a second copy of every mart in `marts_candidate`; player marts (Phase 3) will be doubled too. Step 2.1 stops if the projected total passes 700 MB | No, but 2.1 must count it |
| **Neon compute (O4)** | Not measured since the nightly job started. Rob read 1.77 CU-hours in total since 2026-10-15 during step 1.2, against 100 a month; the plan estimates 2–12 a month. Read it after a week of runs | No |
| **Vercel Preview `DATABASE_URL` (O3)** | Not confirmed for Preview deployments. Matters once pull requests need working previews | No |
| **Branch protection (O7, O8)** | `main` is unprotected (accepted, D3; revisit at Gate D). The `production` environment is limited to `main`; the `test` environment has no branch restriction, so any branch can run against the test database | No |
| **Neon branches (O6)** | `foundation` and `nightly-test` weren't re-checked in the console at the end of Phase 1 | No |
| **Unverified assumptions and timing (O9, O10)** | dbt replacing each table in one transaction is assumed from dbt's documentation; a slow Open-Meteo night can take about 15 minutes of the 45-minute job | No; but player loads add to the same job |
| **Background watchers (O13)** | Long-running shell watchers on this Windows machine can die (a Git Bash `fork` failure). Gather evidence from GitHub's run history and fresh checks instead | No (process note) |
| **Parking lot** | Also open: the dev-toolchain npm audit findings, a CI check for documentation coverage, cold visits and a shared cache, team names on the 404 page, an atomic switch across marts | No |

**Genuine blockers for Phase 2:** none.

## E. Phase 2 requirements and dependencies

**Goal** (build plan, Phase 2): every player source the MVP needs is loaded into `raw` from 2016:
- checked;
- repeatable with one command;
- refreshed nightly.

Phase 2 is the raw layer only. dbt models, scoring and pages start in Phase 3. Its end is **Gate A** (build plan, "Release milestones"):
- the audit document and notebook 07;
- the four tables loaded locally and on Neon, with checks that fail when broken;
- the snap mapping at least 99.5% in every season;
- Neon under 700 MB.

**Planned steps.** The full tasks and Done-when checks are in `docs/build-plan.md`. Requirements §7 "Phase 2" and §5 are the product side.

| Step | What | Done when (short) |
| --- | --- | --- |
| 2.1 | Source audit and column choice: notebook 07, `docs/fantasy-source-audit.md` (the requirements' §5.2 table per source) | 0 duplicate keys; scoring identity with 0 mismatches; snap mapping ≥ 99.5% per season; projected Neon < 700 MB |
| 2.2 | Harden `upsert_dataframe`: refuse duplicate or null keys and missing scope values; an explicit type map; move `compact()` to `db.py`; `test_upsert.py` importable without `DATABASE_URL` | New tests pass and fail without their guard; existing reruns change nothing |
| 2.3 | `raw.player_stats_weekly`, key `(player_id, game_id)`, every player with an ID; placeholder "Team" rows dropped and counted | Rows = source minus placeholders; idempotent; a hand-edited row restored; 0 duplicates |
| 2.4 | `raw.players` (key `gsis_id`) and `raw.rosters_weekly` (key `(season, week, gsis_id, team)`, the 2.1 trims) | Every stats `player_id` in `raw.players`; traded players once per team; idempotent |
| 2.5 | `raw.snap_counts`, key `(game_id, pfr_player_id)`; late-tolerant ("not yet published"); the mapping gate | Gate passes every season; idempotent; a simulated missing week records snaps as pending |
| 2.6 | Player checks in `test_raw_data.py` and `pipeline/sql/checks/`; explain the 2 residual team mismatches | Checks pass and fail when broken on purpose |
| 2.7 | With Rob's approval: a full load on Neon, the checks on Neon, the tables added to the nightly job; storage recorded | Neon checks pass; storage recorded; the next nightly run records each player table |

**Sources and facts already identified.** These were checked on 2026-10-21 with nflreadpy 0.1.5, pinned in `uv.lock`; the build plan's "Data sources" section has the numbers.
- **The four sources:**
  - `load_player_stats(summary_level="week")`;
  - `load_players()`;
  - `load_rosters_weekly()`;
  - `load_snap_counts()`, from Pro Football Reference, which must be credited.
- **What 2.1 decides:**
  - which of the 150 player-stats columns to keep (about 45);
  - the weekly roster trims (an open decision; recommended: fantasy positions plus FB, about 12 columns).
- **What isn't used:** injuries, depth charts, participation and `ff_opportunity`.
- **Decided already:**
  - snap counts are required;
  - the scoring identity holds with return TDs at +6 and offensive fumbles lost;
  - team codes pass through `current_team()`.

**Reuse.**
- **Loading:** `upsert_dataframe` and `nflverse_to_pandas` in `pipeline/db.py` (hardened in 2.2), and the per-table loader pattern in `pipeline/__main__.py` (`TABLES`, `RAW_TABLE`, `default_loaders`).
- **Run records:** `RunLog`.
- **Checks:** the `test_raw_data.py` and SQL-check pattern.
- **Team codes:** `transform/macros/current_team.sql` and the `team_code_map.csv` seed.
- **Notebooks:** the notebook conventions in `CLAUDE.md`, "Notebooks".
- **Production:** `pipeline.backup_schema --verify` before production schema changes.
- **Publishing:** `pipeline publish`, which locks new raw tables automatically.

**Uncertainties to settle while planning, before any code:**
- **Re-verification.** Every number above is from 2026-10-21. Coverage of the 2026 season has moved since, and the nflverse files may have changed. 2.1 re-measures them.
- **A "not yet published" status for snap counts.** `raw.source_loads.status` allows only `success` and `failed` (a CHECK in `pipeline/sql/run_records.sql`). 2.5's pending status needs a schema change, which on Neon is an expand step with a backup first. Decide how it fits.
- **Which sources are required.** `decisions.md` ("Freshness and partial failure") names schedules **and player stats** as required, but the code's `REQUIRED` is `{"schedules"}`. Planning should settle when player stats join it (2.7 at the latest), and what the exit codes and the nightly job then do.
- **Storage.** Count the candidate-schema copy, and indexes, in 2.1's projection, not just the table data.
- **Nightly time budget.** A current-season load of four more sources must fit inside the 45-minute job. The full historical loads run once, by hand, with approval.
- **Data freshness.** `marts.data_freshness` reads every table in `raw.source_loads`, so new sources appear in it automatically. The footer stamp stays on schedules. Check that nothing else needs a change.

**Data risks** (the build plan's "Risks and safeguards" lists the safeguards):
- **Identifiers:**
  - 536 placeholder "Team" rows have no `player_id`;
  - 26 roster rows (2025–26) have a null `gsis_id`;
  - `pfr_id` ↔ `gsis_id` is 1:1 in `load_players()`, but must be re-checked;
  - never resolve an ID by name.
- **Roster history:**
  - traded players appear on two teams in one week (9 player-weeks);
  - the weekly roster already holds the upcoming week;
  - `INA` reflects game-day inactives, which matters later for point-in-time features.
- **Snap counts:**
  - they use the listed team codes (OAK, SD), while player stats use today's codes;
  - publication depends on Pro Football Reference's schedule;
  - the mapping coverage was 99.80–100%, and 12.7% of appearances have snaps but no stats row.
- **Team codes:** 2 residual team or opponent mismatches against the schedule are still unexplained (2.6). Any correction is Rob's decision.
- **Warehouse storage:** see section D.

## F. Recommended starting workflow

1. **Read** this handoff, then `CLAUDE.md`, `docs/decisions.md` (at least "Ingestion", "Fantasy application", "Baseline and reliability"), the Phase 2 section and "Data sources" in `docs/build-plan.md`, requirements §0, §5, §6.2–6.5 and §7 "Phase 2", and `docs/data-model.md`, "Raw layer".
2. **Verify the state:**
   - `git status` (clean, `main` in sync with `origin/main`);
   - the latest CI run is green;
   - the latest nightly runs (`gh run list --workflow nightly.yml`).

   Don't connect to Neon without announcing it to Rob first.
3. **Inspect the code Phase 2 extends:**
   - `pipeline/db.py`, `pipeline/__main__.py`, `pipeline/runs.py` and `pipeline/load_pbp.py`;
   - `pipeline/tests/test_upsert.py` and `test_raw_data.py`;
   - `transform/macros/current_team.sql`.

   Locally, a small read-only nflreadpy probe can confirm what the sources currently return, without writing to any database.
4. **Audit** the Phase 2 steps against the repository and the sources as they are now, and list where they disagree, including the uncertainties in section E.
5. **Draft** a detailed Phase 2 plan in the style of `docs/plans/phase-1.md`: tasks, files, tests, safeguards and approvals per step, with the open decisions presented with counts and a recommendation.
6. **Present** it to Rob for approval. Save the agreed plan as `docs/plans/phase-2.md` and link it from the build plan. Only then start 2.1.

**Don't implement anything in Phase 2 until Rob has approved the plan.**

## G. Step 2.1 implementation readiness (added 2026-10-23, end of the planning session)

A checklist for the session that implements step 2.1. The authoritative plan is **`docs/plans/phase-2.md`**. For step 2.1 itself, read §6 "Step 2.1", plus §3 P2-D3, P2-D4, P2-D5 and P2-D13. Don't replan Phase 2: its decisions P2-D1 to P2-D13 are agreed.

### Starting state
- **Branch and sync:** `main`, in sync with `origin/main`. The planning commits are:
  - `2577ab7 Phase 2: agreed implementation plan`;
  - then this handoff update.
- **Tree:** clean. No Phase 2 code or notebook exists (`notebooks/07_*` and `pipeline/load_player_*` are absent), and no player table exists locally or on Neon.
- **Build plan:** boxes 1.1–1.6 are ticked and 2.1–2.7 unticked; Phase 1 is verified (`docs/plans/phase-1-verification.md`).
- **Probes:** the planning session's read-only probes were scratch files outside the repo. Their findings are summarised in the plan's §2 and X1–X17, and 2.1 reproduces them in the notebook.

### Step 2.1 scope
- **Deliverables:**
  - `notebooks/07_player_sources.ipynb`, which re-runs headless with asserts as its Done-when;
  - `docs/fantasy-source-audit.md`: requirements §5.2's eight items per source, the weekly-stats-versus-play-by-play statement, the licences, the two-attribute terminology (MVP dependency vs nightly failure policy) and the P2-D13 investigation;
  - `docs/figures/player_source_coverage.png`.
- **Files to modify:**
  - `docs/decisions.md`: a 2.1 entry recording the columns, trims, types, anomalies, the projection and G1, the 11-player threshold, the P2-D13 evidence and options, and the 2.1 storage-rule amendment (P2-D4);
  - `docs/build-plan.md`: the Data sources table re-verified with dated numbers (X1–X8), the storage table, the terminology, and the 2.1 tick.
- **Reuse:**
  - `pipeline.db.nflverse_to_pandas` (never write Polars code);
  - `pipeline/analysis.py` (`chart_style`, `save_figure`; load the `dataviz` skill before chart code);
  - the notebook conventions in `CLAUDE.md`;
  - the size-estimator method in the plan's §7 (calibrate against `raw.schedules`, and use `raw.pbp_pkey` for the key factor; local catalogue reads are read-only).
- **Audits and asserts** (the plan's §6 Step 2.1, items 5–6):
  - per source: schema and dtypes, rows per season and type, keys after the documented drops, null and blank IDs, ID mappings, team codes against the schedule, current-season coverage, columns null by season, integer maximums, release upload times;
  - the scoring identity (0, 194, 432);
  - zero-stat appearances;
  - the 11-player completeness test and its known historical exceptions;
  - the delete-pattern table;
  - X1–X6 listed by row;
  - the column lists and the explicit type map per table;
  - **asserts:**
    - 0 duplicate keys;
    - scoring identity 0;
    - snap mapping ≥ 99.5% in every season 2016–2026;
    - placeholders have 0 offensive volume;
    - the 2 null-opponent rows are placeholders;
    - multi-team roster rows ⊆ the known 2019 collision;
    - G1.
- **Storage, G1:**
  - (a) the Gate A projection, the high estimate on the console figure, must be under 700 MB;
  - (b) the full-MVP low estimate must be under 700 MB.
  - If either fails, stop before 2.2 and hand Rob the mitigations M1–M7.
- **What Rob provides:** from the Neon console (read-only; no connection from Claude), the project's **storage** and **history** figures, with their units and the date. Give him click-by-click steps.
- **P2-D13** (strict):
  - the investigation:
    - Sports Reference's Terms of Use (clause 5) and "Acceptable Use of Sports Reference Data", read in full;
    - nflverse's statements on snap counts (`nflverse-pfr` README and licence, the `load_snap_counts` docs);
    - exactly what the MVP would store and show;
    - a draft permission request for Rob to send himself.
  - Weigh nflverse's CC BY 4.0 statement and Sports Reference's terms **together**. Don't assume attribution, internal-only use or derived values resolve the concern.
  - Recommend R-a, R-b or R-c from the evidence; **Rob decides**.
  - Snap counts may be read **in memory only**, for aggregate coverage. The committed notebook and audit show aggregates only, never player-level snap rows, and nothing goes into any database.
- **Done-when:**
  - the notebook's asserts pass on a headless re-run (`uv run jupyter nbconvert --to notebook --execute --inplace notebooks/07_player_sources.ipynb`);
  - the audit is complete;
  - G1 passes.

  The rights decision isn't part of 2.1's Done-when; it is 2.5's precondition.
- **Checks before the commit:**
  - `uv run ruff check` (notebooks are excluded);
  - `uv run pytest` (with Docker up);
  - the notebook re-run.

  No web or dbt files change.
- **Commit:**
  - one commit, `2.1: player source audit`, with the box ticked in it (fully checkable before the push), then push;
  - commit the notebook with its outputs;
  - then a clause-by-clause walkthrough for Rob, and a stop.

### Approval boundaries
1. **Already authorised for step 2.1:**
   - reading the four nflverse sources and schedules into memory;
   - GitHub's public API (release timestamps) and reading the public terms pages;
   - read-only catalogue queries on the **local** database;
   - creating and changing the files listed above;
   - running the local tests and the notebook;
   - committing and pushing step 2.1's docs-and-notebook commit once its Done-when passes.
2. **Needs Rob's approval first:**
   - any Neon connection, even read-only (none is planned for 2.1);
   - confirming P2-D3 or P2-D5 again if the notebook's counts differ materially from the plan;
   - the P2-D13 outcome (R-a, R-b or R-c);
   - sending the permission request (Rob sends it);
   - any change to a decision already agreed;
   - moving on to step 2.2.
3. **Prohibited in this session:**
   - any production database write;
   - any schema change, local or Neon;
   - implementing any part of steps 2.2–2.7 (loaders, upsert changes, run-record columns, checks, workflow edits);
   - loading snap counts, or any PFR-derived data, into any database before P2-D13 is resolved;
   - committing player-level snap rows;
   - changing `.github/workflows/`, `web/`, dbt models or Vercel;
   - printing or committing secrets;
   - starting step 2.2 automatically, even when 2.1 passes.
