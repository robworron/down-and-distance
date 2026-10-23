# Phase 1 verification

**Status:** **Complete.**
- **Stage A:** 2026-10-22, about 18:30 UTC.
- **Stage B:** 2026-10-23, about 22:00 UTC, after the first scheduled nightly run ([39968873806](https://github.com/robworron/down-and-distance/actions/runs/39968873806)).
- **Verdict:** every Phase 1 acceptance criterion is met. Phase 2 may start once Rob authorizes it. Outstanding issues are listed below; none blocks Phase 2.

- **Audited:** `main` at `289d06c` (clean, in sync with `origin/main`).
- **Criteria:**
  - each step's Done-when in `docs/build-plan.md`;
  - the agreed plan's end-to-end checklist (`docs/plans/phase-1.md`);
  - requirements §7, Phase 1.

  `docs/decisions.md` holds the full evidence for each step; this report checks it again and adds what was measured today.
- **Ground rules:**
  - Nothing here dispatched a workflow or changed production.
  - Production reads were announced and run in read-only sessions.
  - The five test-target rehearsals and the manual production run were reviewed from their logs, not repeated. Their evidence still holds: every later commit (`289d06c`) only adds the database-target check and docs.

## Verdict by criterion

| # | Criterion | Status |
| --- | --- | --- |
| 1.1 | Every baseline check has a recorded result, and every failure a decision | ✅ VERIFIED |
| 1.2 | `foundation` tag on GitHub; Neon branch confirmed; dump exists and restores; `--check` access as on 2026-10-19 | ✅ VERIFIED (the Neon branch was confirmed by Rob on 2026-10-21, not re-checked; see O6) |
| 1.3 | `main` green; a type-error PR and a failing-pytest PR red; `ci.yml` has no secrets | ✅ VERIFIED |
| 1.4 | 404 / 200 / 308 locally and live; each empty and error state shown once; titles and descriptions in the head; tests, lint and build pass | ✅ VERIFIED |
| 1.5 | Route table; repeat visits faster locally and live; 401 / 405 / 503; a POST refreshes a changed value; tests pass | ✅ VERIFIED |
| 1.6a | A manual run is green | ✅ VERIFIED |
| **1.6b** | **A scheduled run fires on its own** | ✅ **VERIFIED**: [39968873806](https://github.com/robworron/down-and-distance/actions/runs/39968873806), event `schedule`, green; it started about 4 h 51 min after the cron time (O12) |
| 1.6c | The footer stamp advances without a redeploy | ✅ VERIFIED on the manual production run, and again on the scheduled run (no Vercel build since 2026-10-22 18:07). Exception: the 404 page's stamp (O2) |
| 1.6d | A deliberately broken dbt test turns the run red, skips the refresh, and leaves `marts` untouched | ✅ VERIFIED |
| 1.6e | A forced weather failure is recorded in `raw.source_loads` while the other tables still load | ✅ VERIFIED |
| 1.6f | A rerun changes no data row counts | ✅ VERIFIED |
| Req §7 | Baseline; restore point; architecture; states, metadata and protected invalidation; a scheduled refresh with run records and visible freshness | ✅ |

## Evidence

### 1.1 Baseline checks
- **Record:** `decisions.md`, "Baseline checks before any Phase 1 change", on `cfbf291`: pytest 46, dbt 332, lint 0, Vitest 110, tsc 0, `next build` OK, no failures.
- **The same set today, on `289d06c`:**
  - ruff: clean;
  - pytest: **143 passed, 0 skipped**;
  - `dbt build`: **PASS=338**, ERROR=0;
  - ESLint: clean;
  - `next typegen` + `tsc --noEmit`: 0 errors;
  - Vitest: **136** (13 files);
  - `next build`: the route table below;
  - `npm audit --omit=dev`: 0 vulnerabilities.

  ```
  ○ /, /_not-found, /teams, /this-week        1d / 1y
  ◐ /explorer, /leaderboards                  1d / 1y
  ◐ /teams/[team] (fallback + 32 team shells) 1d / 1y
  ƒ /api/revalidate
  ƒ Proxy (Middleware)
  ```

### 1.2 Restore points
- **Tag:** `git ls-remote --tags origin` shows `refs/tags/foundation^{}` = `cfbf2914b715fa87f24056e4b67cf0808310ce1a`.
- **Neon branch `foundation`:** confirmed by Rob on 2026-10-21, with `restore_point_counts.sql` identical on both branches. It wasn't re-checked here (no console access).
- **Schema dumps** (gitignored `backups/`):
  - `neon-schema-2026-10-21-2244.dump` (1.2);
  - `neon-schema-2026-10-22-1251.dump` (taken before 1.6's first production schema change);
  - `neon-schema-2026-10-22-1422.dump`, today, of the current schema: **955 objects** (marts 10, marts_candidate 10, raw 6, staging and staging_candidate 3 tables + 4 views each). **Restored locally with no errors**, matching the dump's contents.
- **Access:** `create_web_reader --check` gives **marts 10 of 10, staging 0 of 7, raw 0 of 6**, writes refused, sessions read-only. Same rules as 2026-10-19; there are 10 marts now.
- **Recovery procedures:** `decisions.md`, "Restore points": checking out the tag, restoring production from `foundation` (Rob only), restoring a schema dump into a new database, and verifying with the counts SQL.

### 1.3 Pull-request checks
- **CI on `main`:** green on every push in Phase 1 (no failed CI run on `main`), and on `289d06c`: `web` and `python` both success.
- **Red checks** (`decisions.md`, "Pull-request checks"):
  - robworron/down-and-distance#1, a type error, made `web` fail at tsc (run 39716112518);
  - robworron/down-and-distance#2, `assert False`, made `python` fail at pytest (run 39716116394).
- **No secrets:** `ci.yml` references none; `permissions: contents: read`; the repository's default workflow token is read-only.

### 1.4 States and polish
- **Status codes, live:** `npm run check:status` passes **18 of 18** against the live site:
  - `/teams/xyz`, `/teams/XYZ`, `/teams/oak`, `/teams/b-u-f` and `/teams/xyz?from=2020`: 404;
  - `/teams/BUF`: 308 to `/teams/buf`, query string kept;
  - `/teams/buf`: 200;
  - the other routes unaffected.

  Locally, against `next start`: also 18 of 18.
- **Head metadata, live and local:** every route has a title and a description, read with an HTML-limited bot's user agent.
- **States:** each empty and error state shown once (`decisions.md`, "States and polish", with screenshots kept outside the repo).

### 1.5 Caching and the refresh route
- **Route table:** as above.
- **Timings, live** (median of 10 repeats, total ms): `/teams` 196 → 122; `/this-week` 308 → 153. First visits: `/teams` 2,005 → 129. (`decisions.md`, "Caching and the refresh route".)
- **The refresh route, live:**
  - **401** for a wrong secret and for no header (empty, `no-store`);
  - **405** for GET;
  - **503** before the secret was set (fails closed);
  - the same locally today: 401 / 401 / 401 (`Basic`) / 405.
- **A POST refreshes a changed value:**
  - L4 locally;
  - V5 live with a real production change (`2026_06_WAS_SF`): new on 80 of 80 requests per probe over 10 minutes.
- **Matrices:** L1–L8 and V1–V5 are recorded, with the guarantees table.

### 1.6 Nightly refresh and run records

**The lock**, tested before relying on it:
- in a throwaway database: 18 of 18 checks;
- on Neon's direct production host, with no data written: 14 of 14;
- and the Neon idle-in-transaction timeout found there is fixed.

**Local rehearsal** R1–R9 (`decisions.md`, "Nightly refresh and run records").

**GitHub Actions runs of `nightly.yml`**, all `workflow_dispatch` (no scheduled run yet):

| Run | Commit | Target / simulate | Result | Notes |
| --- | --- | --- | --- | --- |
| [39819651675](https://github.com/robworron/down-and-distance/actions/runs/39819651675) | `bef6452` | test / none | red | Real Open-Meteo timeout (defect D-1). Weather recorded `failed`; others loaded; published |
| [39820393784](https://github.com/robworron/down-and-distance/actions/runs/39820393784) | `bef6452` | test / none | red | Same timeout again: the two-attempt stop, then option A (retry) |
| [39821556529](https://github.com/robworron/down-and-distance/actions/runs/39821556529) | `47ca442` | test / none | red | Retries recovered 8 timeouts; Neon then ended the idle run-log connection (defect D-2) |
| [39824455597](https://github.com/robworron/down-and-distance/actions/runs/39824455597) | `1252602` | test / none | **green** | Every load `success`; publish 338 / 338; F0 = F1; 9 marts replaced |
| [39825325174](https://github.com/robworron/down-and-distance/actions/runs/39825325174) | `1252602` | test / weather | red (expected) | `game_weather` `failed` (simulated), the other three `success`; run `partial`; published |
| [39825681496](https://github.com/robworron/down-and-distance/actions/runs/39825681496) | `1252602` | test / schedules | red (expected) | Ingest exit 2; publish skipped; **0 of 10 mart OIDs changed** |
| [39825774477](https://github.com/robworron/down-and-distance/actions/runs/39825774477) | `1252602` | test / dbt_test | red (expected) | Candidate PASS=337, ERROR=1; "marts untouched (10 tables, same identities)"; **0 of 10 OIDs changed** |
| [39825943792](https://github.com/robworron/down-and-distance/actions/runs/39825943792) | `1252602` | test / none, compare | **green** | **+0 ~0 -0** in every table; "10 of 10 marts identical to the candidate" |
| [39827151371](https://github.com/robworron/down-and-distance/actions/runs/39827151371) | `1252602` | production / none | red | The production secret held the local URL (defect D-4). Failed before any database step; Neon untouched |
| [39827562612](https://github.com/robworron/down-and-distance/actions/runs/39827562612) | `1252602` | production / none | **green**, 2 min 17 s | Ingest exit 0; gate 15 / 15; candidate and publish 338 / 338; F0 = F1; refresh 200; `--expect-stamp`: every page `18:00:36Z` |

- **Isolation:** every test-target run wrote only to `nightly-test`. Production's run records and mart identities were unchanged across all eight test runs, checked read-only after each batch.
- **Credential scan:** across all 10 run logs, **0** lines match a connection string, a Neon host, a Neon password, `password=` or a bearer token.

**Production now** (read-only, Postgres 18.6):
- **raw:** `schedules` 7,548, `pbp` 500,634, `game_weather` 5,957, `teams` 36; `pipeline_runs` 2 (local 16:55 and workflow_dispatch 18:00, both `success`, about 6 s each; none left `running`); `source_loads` 8, all `success`.
- **marts.data_freshness:** all 4 sources `success` around 18:00:37 UTC.
- **`restore_point_counts.sql`:** every count equals the 2026-10-21 `foundation` snapshot. The only change is `raw.schedules`' last load time; schedule rows were updated in place, as lines move.
- **`candidate_schemas_unreadable.sql`:** `marts_candidate` and `staging_candidate` give `web_reader` no usage, no create and 0 readable tables; `marts` gives usage and 10 readable tables.
- **Defaults:** `web_reader`'s default privileges exist in `marts` only; its sessions are read-only by default. The server's `idle_in_transaction_session_timeout` is 5 min, and publish raises it to 40 min for its own transaction only.

**The live site:**
- Every main page, the request-time `/teams/buf?from=2016` and the 404 page show stamp `2026-10-22T18:00:36Z`, which matches `marts.data_freshness`. All served as `X-Vercel-Cache: HIT`.
- Vercel deployed `main`'s HEAD (`289d06c`): "Deployment has completed".

### Stage B: the first scheduled run
- **The run:** [39968873806](https://github.com/robworron/down-and-distance/actions/runs/39968873806), event **`schedule`**, commit `289d06c`, conclusion **success**.
  - It was created at 14:21:05 UTC on 2026-10-23, and the job ran 14:21:10–14:23:38 (**2 min 28 s**). That's about 4 h 51 min after the 09:30 UTC cron time.
  - Every step succeeded (the simulation guard is skipped, as it should be on production).
- **The target check, on its first use on a runner:** "DATABASE_URL points at a remote host (not shown); the production run can continue."
- **Ingest:** exit 0 in 7 s.
  - `raw.schedules` +0 / ~22 / -0;
  - `raw.teams` unchanged;
  - `raw.game_weather` unchanged (65);
  - `raw.pbp` **+171** / ~14 / -0 (Thursday's game).
- **Raw gate:** 15 passed, 2 advisory deselected.
- **Builds:** candidate PASS=338, then the real build PASS=338; "published: 9 marts replaced, raw unchanged under the lock (F0 = F1), row counts equal to the candidate, in 95 s".
- **Refresh:** 200; all 6 page checks ok; **"stamp: every page shows 2026-10-23T14:21:37Z"**.
- **Advisory checks:** 2 passed.
- **The run summary:** "every stage succeeded".
- **Production, read-only:**
  - `raw.pipeline_runs` has 3 rows, the newest **`schedule` / `production` / `success`** (git `289d06c`, 7 s), with all four `source_loads` `success`; none left `running`.
  - `marts.data_freshness` shows all four sources `success` at about 14:21:37.
  - `raw.pbp` went from 500,634 to **500,805**, matching the run's +171.
- **The live site** (22:00 UTC):
  - **Stamp:** every main page shows **`2026-10-23T14:21:37Z`**, "Data updated Fri Oct 23, 10:21 am ET": `/`, `/teams`, `/teams/buf`, `/teams/buf?from=2016`, `/explorer`, `/leaderboards` and `/this-week`, all equal to Neon.
  - **No redeploy:** since the last push (2026-10-22 18:07 UTC), the only deployment record is GitHub's own `production` environment record (14:21:06), and Vercel's latest build of `main` is from 2026-10-22 18:07:40.
  - **Health:** 18 of 18 status checks pass; every route has its title and description in the head.
- **Access:** `create_web_reader --check` gives marts 10 of 10, staging 0 of 7, raw 0 of 6, writes refused, sessions read-only. `candidate_schemas_unreadable.sql`: no usage, 0 readable tables in either candidate schema.
- **CI:** green on `main` (`289d06c`).
- **Credential scan** of the scheduled run's log: 0 matching lines. (`gh` labelled every line `UNKNOWN STEP` this time, so the log was read by content rather than by step.)
- **Storage:** **234 MB** (raw 188 MB, marts 18 MB, marts_candidate 18 MB, staging and staging_candidate 120 kB each).
- **The 404 page (O2):** `/teams/xyz` and `/nope` still showed **`2026-10-22T18:00:36Z`**, as `X-Vercel-Cache: HIT` with `Age: 100056` s (about 27.8 h).
  - The scheduled run's refresh didn't replace it, and its age is past the 1-day `revalidate`, so **no bound is observed**.
  - **Gap:** the 30-minute watcher logged only 18:12 and 18:43 on 2026-10-22 before Git Bash failed to start a process (`fork: Resource temporarily unavailable`, `0xC000026B`). Nothing it logged was lost, but there are **no observations between 18:43 on 2026-10-22 and 22:00 on 2026-10-23**, and none are inferred.

## Security review

| Check | Result |
| --- | --- |
| Secrets in the repository | 0 of 249 tracked or new files contain any value from `.env` (scanned by value) |
| Secrets in Actions logs | 0 matching lines across 10 nightly runs; GitHub masks environment secrets |
| GitHub configuration | `production`: `DATABASE_URL`, `REVALIDATE_SECRET`; deployments from `main` only. `test`: `DATABASE_URL` only. 0 repository secrets, so there's no fallback between environments. Variables: `NIGHTLY_SCHEDULE=on`, `SITE_URL` |
| Workflow permissions | `ci.yml` and `nightly.yml`: `contents: read`; default token read-only; `persist-credentials: false`; actions pinned to release tags at least 2 weeks old |
| Fault injection | `simulate_failure` refused on production, by the workflow's guard step and by the CLI (`--target`) |
| Database target | `pipeline/check_target.py` refuses local, loopback and socket URLs before any database step (32 tests). **Not yet exercised on a runner** (first use: the scheduled run) |
| Database role | `web_reader`: marts only, read-only sessions, writes refused; the candidate schemas unreadable |
| Refresh route | Constant-time comparison; 401 with an empty body; 503 when unconfigured; nothing logged |
| Error records | `sanitize_error` removes URLs and secret pairs (tested); the production `source_loads` errors are NULL |

## Recovery readiness

| Layer | Recovery | Ready? |
| --- | --- | --- |
| Code | Revert a step's commit (Vercel redeploys from `main`), or check out the `foundation` tag | ✅ Tag verified |
| Production data | Restore from the Neon `foundation` branch (Rob only; procedure in `decisions.md`) | ✅ Procedure documented; branch not re-checked today (O6) |
| Schema | `pg_restore` a dump into a new database; `backup_schema --restore-check` rehearses it | ✅ Today's dump restored cleanly |
| A bad night | The marts stay as they were when the gate or candidate fails (OIDs checked); rerun after fixing (idempotent) | ✅ Rehearsed on the test target |
| Stop the automation | Delete `NIGHTLY_SCHEDULE` (or disable the workflow); cached pages keep serving | ✅ Documented in `CLAUDE.md` |

## Resource usage (measured)
- **Neon storage:** **233 MB** of the 1 GB plan: raw 188 MB, marts 18 MB, marts_candidate 18 MB, staging and staging_candidate 120 kB each. Before step 1.6 it was 215 MB, so the candidate copy added about 18 MB, as the plan estimated.
- **Nightly duration:** 2 min 17 s on production; 2–3 min on the test target with a warm weather cache. 13–16 min when Open-Meteo was slow before the retry cache filled.
- **GitHub Actions minutes:** free, since the repository is public.
- **Neon compute (CU-hours):** **not yet measured.** Rob reads it in the Neon console after a week of nightly runs (plan estimate: 2–12 of 100 a month).

## Defects found during Phase 1 verification (all fixed inside their step)
1. **D-1:** Open-Meteo timed out from GitHub's runners and had no retry. Fixed in `47ca442`.
2. **D-2:** Neon ended the run log's idle connection; ingest crashed with exit 1, so the workflow published without pbp. Fixed in `1252602`.
3. **D-3:** publish's lock could have lost its session to Neon's 5-minute idle limit and mis-reported. Fixed in `66f215f`.
4. **D-4:** the production secret held the local URL. Configuration, corrected by Rob; the `289d06c` safeguard now refuses such URLs.

Earlier in Phase 1, the 1.4 spike showed a page can't set its own 404 status under this app's settings, which led to the Proxy decision (`decisions.md`, "Team URLs checked in Proxy").

## Outstanding issues, unverified assumptions and risks

| # | Item | Severity | Blocks Phase 2? |
| --- | --- | --- | --- |
| O1 | ~~The scheduled run hadn't fired~~: **resolved** 2026-10-23 (run 39968873806, green; the target check passed on its first use) | — | — |
| O2 | **The 404 page's stamp isn't refreshed on Vercel.** The scheduled run's refresh didn't replace it; at 22:00 on 2026-10-23 it still showed the 2026-10-22 stamp (`HIT`, `Age` about 27.8 h, past the 1-day `revalidate`). **No bound observed.** Every main page refreshes; the 404 content and status are correct. There are no observations from 18:43 on 2026-10-22 to 22:00 on 2026-10-23 (the watcher failed). Fix options are in the parking lot | Low: the stamp on an error page | No; decide the fix before or during Phase 2 |
| O3 | **Vercel Preview `DATABASE_URL`** (raised in 1.5) is still undecided. If it isn't set, pull-request preview builds fail, though Production and CI don't | Low | No; decide before Phase 2 uses pull requests |
| O4 | **Neon CU-hours** not measured | Low | No; read after a week |
| O5 | ~~Documentation drift~~: **resolved** in `1.6: record checks` (the build plan's 1.6 text names the environments and `pipeline publish`; both plan files' status lines updated) | — | — |
| O6 | The Neon `foundation` and `nightly-test` branches weren't re-checked (no console access here); `nightly-test` diverges with each test run | Low | No; Rob can confirm both in the console (3 of 10 branches) |
| O7 | **The `test` environment has no branch restriction:** any branch may run against the test database | Low (test data only) | No |
| O8 | **`main` is unprotected** (D3) | Accepted | No; revisit at Gate D |
| O9 | **Unverified assumptions:** dbt-postgres replaces each table in one transaction, so a reader never sees a half-built table (dbt's documented behaviour; not observed with a concurrent reader); warm Vercel instances drop old entries after a refresh (measured once, in V5, not guaranteed); GitHub runs scheduled jobs on time (they can be delayed under load) and turns them off after 60 days without repository activity (for 5.10's runbook) | Accepted, documented | No |
| O10 | **A slow Open-Meteo night can take about 15 minutes.** The weather loader's worst case is about 6 minutes, inside the 45-minute job limit, but it could grow if Open-Meteo worsens | Low | No |
| O11 | **Cosmetic:** `backup_schema`'s per-schema table runs the longer schema names into their counts | Trivial | No |
| O12 | **GitHub ran the first scheduled job about 4 h 51 min late** (09:30 cron, 14:21 start). On a delayed day the site's data arrives later than planned; the run itself was correct | Low to medium, if it persists | No; watch the next runs (an earlier or second cron is in the parking lot) |
| O13 | **Long background watches on this Windows machine can die** (Git Bash `fork` failure). Evidence collection should come from GitHub's own run history and fresh probes, not from a watcher left running overnight | Process note | No |

## Stage B checklist (done 2026-10-23; evidence above)
1. The run's event is `schedule`, not `workflow_dispatch`; record its URL, commit and duration.
2. "Check the database target" passed, on its first use on a runner.
3. Ingest, raw gate, candidate, publish and refresh (`--expect-stamp`) all succeeded.
4. Production `raw.pipeline_runs` has a `schedule` / `production` / `success` row, with all four `source_loads` `success`.
5. The live stamp equals the new `marts.data_freshness` stamp on every main page, and no Vercel deployment came between the publish and the check.
6. The 404 page's stamp, from the watcher's log and a fine-grained probe after the run.
7. `check:status` 18 of 18 live, `create_web_reader --check`, `candidate_schemas_unreadable.sql`, CI green.
8. Storage and the database results, recorded.
9. Then: the `1.6: record checks` commit (evidence, the O5 doc fixes, the 1.6 tick), this report's final verdict, and the Phase 1 summary with its checkpoint concepts.

## Phase 1 summary

**What was built (steps 1.1–1.6):**
- **A measured baseline.**
- **Three restore points:** the `foundation` tag, the Neon `foundation` branch, and schema dumps that restore.
- **CI on every push and pull request,** with no secrets.
- **Real 404s and 308s** through Proxy; error boundaries, skeletons, empty states, metadata, the small-sample rule and touch hints.
- **Every marts query cached,** with static shells and a secret-protected refresh route.
- **The nightly job:** independent loaders with run records; a raw gate and candidate build under a lock on raw before anything is published; a footer freshness stamp the refresh proves on every main page; the test and production environments kept apart.

**Checkpoint concepts** (Rob should be able to explain each):
1. **What was preserved and why.**
   - The `foundation` tag, branch and dumps are the last-resort rollback.
   - Every change was additive, and production went expand → deploy → contract, so the live site never errored.
   - The marts are only replaced by a build that passed every test.
2. **CI vs the nightly job.**
   - **CI** checks *code*: lint, types and tests on every push. It runs against a throwaway database, holds no secrets, and never touches Neon.
   - **The nightly job** refreshes *data* in production, with environment secrets: ingest, gate, candidate, publish, then refresh.
3. **How to roll back:**
   - **code:** revert the step's commit (Vercel redeploys from `main`), or check out the `foundation` tag;
   - **a bad night:** marts are untouched when the gate or candidate fails; rerun after a fix (idempotent);
   - **automation:** delete `NIGHTLY_SCHEDULE`;
   - **data:** restore production from the Neon `foundation` branch (Rob only; `decisions.md`, "Restore points").
4. **A nightly run, step by step:**
   1. Guard against fault injection on production, then refuse a local `DATABASE_URL`.
   2. Ingest each source independently, recording every outcome; schedules is required.
   3. Publish: SHARE-lock raw (F0); raw gate; candidate build into `*_candidate` with every test; only then the real build; then F1 = F0 and equal row counts.
   4. Refresh the site and check the new stamp on every main page.
   5. Run the advisory checks; the run turns red if any stage failed.

**What the candidate build does and doesn't guarantee:**
- **Does:** every published mart was built from the same frozen raw rows as a candidate that passed every test, and a failure before the real build leaves the marts exactly as they were.
- **Doesn't:**
  - an atomic switch across marts (they're replaced one by one over about 40 s);
  - correctness beyond what the tests check;
  - protection once the lock is lost (which is detected after the fact, exit 3).

## Readiness verdict
**Phase 1 is complete: every acceptance criterion in the build plan, the agreed plan's checklist and requirements §7 is verified, with evidence above.** Nothing outstanding blocks Phase 2.

Before or early in Phase 2, Rob should decide or check:
- **O2:** the 404 page's stamp fix;
- **O3:** Vercel Preview's `DATABASE_URL`, before Phase 2 relies on pull-request previews;
- **O4:** read Neon's compute use after a week of nightly runs;
- **O6:** confirm the `foundation` and `nightly-test` branches in the Neon console;
- **O12:** watch whether scheduled runs keep starting late.

Phase 2 starts only with Rob's authorization, and with its plan agreed and saved in `docs/plans/` first.
