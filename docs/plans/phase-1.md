# Phase 1 implementation plan: baseline and reliability (steps 1.1–1.6)

**Status:** agreed with Rob on 2026-10-21: the plan, decisions D1–D7 and the refinements below. Not started.

Read this with `CLAUDE.md`, `docs/decisions.md` and Phase 1 of `docs/build-plan.md`. Where this plan and `decisions.md` disagree, `decisions.md` wins.

## Context

Phase 0 (pipeline, dbt warehouse, analysis, team research site) is built and live. Phase 1 closes four reliability gaps before any player code: no CI, a soft 404, no caching, and no automation (production data is already days stale). This plan turns build-plan steps 1.1–1.6 into executable tasks, checked against the actual code on 2026-10-21. `docs/decisions.md` still wins where it disagrees; `docs/plans/states-and-caching.md` stays the agreed design for 1.4 and 1.5, and this plan refers to it rather than repeating it.

**Refinements agreed in review.** The six steps, their acceptance criteria and D1–D7 are unchanged; four refinements were added:
1. **Publishing safety (1.6).** It states exactly what the nightly job guarantees and what it doesn't, adds one minimal safeguard (a candidate build), and lists the residual risks.
2. **Failure testing (1.6).** Every deliberate failure runs locally or on a Neon development branch, never on production.
3. **Cache correctness (1.5).** A verification matrix for:
   - failed or missed refreshes;
   - freshness while cached pages stay visible;
   - Vercel's serverless behaviour;
   - browser-side staleness;
   - recovery.

   The documented guarantees are limited to what Next 16.4.1 and the measurements support.
4. **The same raw data for both builds (1.6).** The candidate and published builds read one frozen raw snapshot, and the limits of that are written down.

---

## Verified facts vs assumptions

**Verified in the repo, on GitHub and on the live site (2026-10-21)**

| Area | Fact |
| --- | --- |
| Step 1.1 | **Already done.** Commit `8b40736 1.1: baseline checks` ticks the box. It records, on `cfbf291`: pytest 46/46, dbt build 332/332, lint 0, Vitest 110/110, tsc 0, `next build` OK, no failures. |
| Git/GitHub | `main` is clean and in sync. There are no tags, local or remote. The repo is public (`robworron/down-and-distance`), Actions are enabled, there are 0 workflows (only `.github/workflows/.gitkeep`), no repo secrets, `main` is unprotected, and `gh` is logged in as robworron. |
| Docker | **Docker Desktop is not running right now.** Every local database check needs it. |
| Live site | `/teams/xyz` returns **200** (the soft 404). `/teams/BUF` returns 200 (no redirect). `/api/revalidate` and unknown paths return 404. `/teams` is a prerendered shell (`X-Vercel-Cache: HIT`, `X-Nextjs-Stale-Time: 300`, `Cache-Control: public, max-age=0, must-revalidate`). |
| Web code | Next 16.4.1 with `cacheComponents` and `partialPrefetching`. There's no `cacheLife`, no `'use cache'`, no `error.tsx`/`global-error.tsx`/`loading.tsx`. `/teams` calls `connection()`. The team page validates the slug *inside* `<Suspense>`, so `notFound()` runs after streaming starts. The root `not-found.tsx` has no metadata, and the team page has no `generateMetadata`. `/teams`, `/explorer`, `/leaderboards` and `/this-week` already have static metadata. `lib/queries.ts` has 10 async query functions plus the pure `explorerStatement`. `MIN_GAMES_FOR_INTERVAL = 3` already exists in `lib/stats.ts` (used by the explorer only). The footer has no freshness stamp. |
| Next docs (bundled, 16.4.1) | **`cacheLife`:** `stale` is how long the *browser router* reuses data without asking the server (the router's floor is 30 s); after `revalidate`, the next request is served the cached copy while it regenerates in the background; after `expire` with no traffic, the next request waits. **`revalidateTag(tag, { expire: 0 })`** in a route handler makes the next request a blocking miss, and revalidation happens as pages are *visited*, not when the call is made. **The default `use cache` store is in memory per instance;** on serverless, entries "typically don't persist across requests", and on a multi-instance host `revalidateTag` "only invalidates the cache on that instance" unless the platform coordinates tags. Cache keys include the build ID, so a deploy starts fresh. Also: `catchError`, `instant = false`, `next typegen`, and streaming metadata (`<body>` for normal user agents, `<head>` for HTML-limited bots). |
| TypeScript in CI | `next-env.d.ts` is gitignored and pages use the generated global `PageProps`, so on a fresh checkout `tsc --noEmit` fails unless `next typegen` runs first. |
| dbt | `dbt parse` succeeds against an unreachable host (run today into the scratchpad). There's no `packages.yml`. `situation_registry()` checks `execute`. `generate_schema_name` returns the custom schema name exactly. **No model, macro or test names a schema in SQL** (every `raw.`/`marts.` match is a comment) **or uses a clock** (`current_date`, `now()`), so identical raw data gives identical marts. Sources are declared with `schema: raw`, which a schema suffix doesn't touch. The only window functions order by `gameday` within a team-season (`team_games`; at most one game a day) or break stadium ties by the last home-game date (`team_seasons`), so both orders are total. The only floating-point sums are `team_game_stats`' EPA. Sources have no tests. |
| ruff | ruff 0.17.1, default rules (`--isolated`), finds 7 issues: 5 in notebooks 02–04, plus `pipeline/load_pbp.py` (I001) and `pipeline/tests/test_transforms.py:86` (RUF015). |
| Python tests | `test_upsert.py` calls `is_local_database()` at import, so it needs `DATABASE_URL` set. `test_raw_data.py` reads the data tables, except two checks that only read the seed. |
| Loaders | Each `upsert_dataframe` call is one transaction (the psycopg context rolls back on an exception). Play-by-play upserts one season per call. The weather loader swallows `RateLimited` and returns `None`. `get_current_season()` returns last season until the Thursday after Labor Day. |
| Grants | `web_reader.sql` grants on `marts` only, and sets default privileges in `marts` only, so a schema dbt creates with any other name is unreadable by `web_reader`. |
| Actions to pin | `actions/checkout` v7.0.1, `actions/cache` v6.1.0, `actions/setup-node` v7.1.0, `astral-sh/setup-uv` v10.3.1 (published today). |

**Assumptions (each checked at the step named)**
- **Neon:** about 214 MB used; Free limits of 100 CU-hours, 10 branches and a short restore window. Rob reads them in the console (1.2).
- **Neon branches** copy the parent's roles and data at creation (1.2, 1.6).
- **Vercel:** whether `DATABASE_URL` reaches Preview builds, and its Node version (1.5).
- **Vercel and `revalidateTag`.** Vercel applies it to prerendered shells across the platform. Whether it also reaches in-memory `use cache` entries in warm function instances (Vercel can reuse instances) is **undocumented here; measured live in 1.5**.
- **Next behaviour (1.4 spike):** awaiting `params` plus one uncached query before `<Suspense>`, with `instant = false`, passes `next build`; and `permanentRedirect` there gives a 308.
- **dbt-postgres** replaces each table inside one transaction (build under a temporary name, then rename), so a reader sees the old or the new table, never a half-built one. This is dbt's documented behaviour; the 1.6 rehearsal observes it through table OIDs.
- **GitHub Environments** with their own secrets are available to this public repository on the free plan (1.6).

---

## Sequencing and dependencies

**The approved order 1.1 → 1.6 is unchanged.**

| Step | Needs | Why |
| --- | --- | --- |
| 1.2 | 1.1 (`cfbf291` measured) | The tag goes on the measured commit; restore points exist before any change |
| 1.3 | 1.2 | CI then guards every later push. CI skips `next build` because 1.5 makes builds need the database |
| 1.4 | 1.3 | Its pushes are checked by CI. It introduces the pre-stream team lookup that 1.5 caches |
| 1.5 | 1.4 | It caches and prerenders 1.4's lookup. The refresh route and `pipeline refresh` are what 1.6 calls |
| 1.6 | 1.5, 1.3, 1.2 | The nightly job POSTs to the route and checks the stamp; CI tests its code; the restore points come before automated production writes |

**Inside 1.6, expand → deploy:** the run tables, the candidate schemas and `data_freshness` exist on Neon *before* the footer that reads them is pushed.

**Hooks between steps:**
- `SectionError` (1.4) wraps the footer stamp (1.6).
- `pipeline refresh` (1.5) gains the stamp check (1.6).
- CI's service-container pytest (1.3) runs 1.6's local-only tests.

---

## Working conventions for every step (D1 approved)

- **Before code:** explain the concept in 2–4 sentences. **After SQL-heavy work** (1.2's counts SQL; 1.6's DDL, `data_freshness` and the SQL checks): a clause-by-clause walkthrough.
- **Commit boundary (D1).** Steps whose Done-when can only be checked after the push:
  - the code commit goes first, labelled with the step;
  - the evidence and the tick go in one docs-only follow-up commit, `1.x: record checks`;
  - fixes in between carry the same label.
- **Failure classes:**
  - **blocking:** fixed inside the step;
  - **non-blocking:** goes in the parking lot;
  - **environmental:** recorded, not counted as a defect;
  - the same error after two fix attempts → stop and hand back.
- **Production verification** is limited to:
  - read-only checks;
  - the job's normal operation (an ingest, a publish, a refresh), each run only after Rob says yes.

  Deliberate failures run only locally or on the Neon `nightly-test` branch.
- **Regression set** (1.1's checks, plus ruff from 1.3), rerun before each commit that touches code:
  - `uv run pytest`;
  - `uv run python -m pipeline dbt build`;
  - in `web/`: lint, `tsc --noEmit`, `npm test`, `npm run build`.

---

## Step 1.1 — Baseline checks (complete; verified)

1. **Objective:** measure before changing. Done and committed (`8b40736`); nothing is redone.
2. **Reuse:** the dated baseline entry in `docs/decisions.md` is every later step's reference.
3. **Files:** none.
4. **Tasks:** at the start of the 1.2 session, start Docker Desktop, run `docker compose up -d`, and confirm `git status` is clean.
5. **Decisions:** the regression set is 1.1's list.
6. **Checks:** already recorded: pytest 46, dbt 332, lint 0, Vitest 110, tsc 0, and the build route table.
7. **Risks:** none. Docker being stopped is the environmental issue 1.1 already recorded.
8. **Done-when:** met.
9. **Commit:** `8b40736` (pushed).
10. **Dependencies:** none.

---

## Step 1.2 — Restore points (D7 approved)

1. **Objective:** three restore points (a git tag, a Neon branch, a schema dump), with recovery shown to work. Nothing destructive.
2. **Reuse:**
   - the `dnd-postgres` container's pg_dump 18.6;
   - `dotenv_values` for reading secrets without echoing them;
   - `create_web_reader --check`;
   - the backout table in the build plan.
3. **Files:**
   - `.gitignore` (+`backups/`);
   - new `pipeline/backup_schema.py`;
   - new `pipeline/sql/checks/restore_point_counts.sql`;
   - `docs/decisions.md`, `CLAUDE.md` (the backup command), `docs/build-plan.md`.
4. **Tasks:**
   1. **Git tag.** `git tag -a foundation cfbf291 -m "Phase 0 foundation, measured by step 1.1"`. Show `git show foundation --stat`, then **ask Rob** before `git push origin foundation`.
   2. **Neon branch (Rob, click-by-click):** Branches → *Create branch* `foundation`, parent the production branch, from the current head. Rob also reads off the restore window and the storage used.
   3. **Counts SQL.** Write `restore_point_counts.sql`, commented clause by clause: row counts of six key raw and mart tables, plus `max(_loaded_at)` of `raw.schedules`. Rob runs it in the Neon SQL Editor on `foundation` and on `main`; equal counts confirm the snapshot. No branch connection string reaches Claude.
   4. **Schema dump.** `uv run python -m pipeline.backup_schema` (announced first; a read-only Neon connection):
      - it passes the URL into the container as an environment variable, never on a command line;
      - it runs `pg_dump --schema-only --format=custom` inside the container, `docker cp`s the file to `backups/neon-schema-<date>.dump`, and writes a plain-SQL copy with `pg_restore -f`;
      - it prints the sizes and object counts, never the URL.
   5. **Dump restore check (local, throwaway):** `createdb restore_check` → `pg_restore --no-owner --no-privileges` → count objects per schema (expected: raw 4 tables; staging 4 views and 3 seeds; marts 9 tables) → `dropdb restore_check`.
   6. **Access check.** `create_web_reader --check` (read-only). Expected: marts 9 of 9, staging 0 of 7, raw 0 of 4, writes refused, sessions read-only by default.
   7. **Record it.** The `decisions.md` entry holds the tag SHA, the branch, the dump and the check outputs, plus the recovery procedures:
      - restoring `main` from `foundation` (destructive; Rob only);
      - checking out the tag;
      - verifying either with the counts SQL.
   8. Commit and push.
5. **Decisions and rationale:**
   - **The tag on `cfbf291`,** the commit 1.1 measured.
   - **Custom format plus a plain copy:** a selective restore, and a diffable record.
   - **A reusable module:** requirements §0 asks for an export before each later schema change.
6. **Tests and commands:** `git ls-remote --tags origin foundation` (shows `foundation^{}` = `cfbf291`); the restore check; `--check`.
7. **Risks and recovery:**
   - **A tag on the wrong commit:** checked before the push. Deleting a published tag needs Rob.
   - **Branch storage grows** as `main` diverges. It's bounded by the 214 MB snapshot and counted in 2.1.
   - **A short restore window:** the branch, not point-in-time restore, is the real fallback.
   - **Restore errors:** any error beyond owner or privilege lines fails the check.
8. **Done-when:**
   - the tag is on GitHub;
   - Rob confirms the branch and the counts match;
   - the dump exists and restores locally;
   - `--check` shows marts all readable, staging and raw 0, writes refused, sessions read-only.
9. **Commit:** `1.2: restore points` (the tag is pushed with approval before it).
10. **Dependencies:** 1.1; Docker; Rob's Neon console.

---

## Step 1.3 — Pull-request checks (D2, D3 approved)

1. **Objective:** `.github/workflows/ci.yml` on pull requests and pushes to `main`, with no secrets and no production access; a failing check makes the run red.
2. **Reuse:**
   - `uv sync --locked`;
   - the `local_only` marker and `is_local_database()` (a service container on `localhost` makes those tests run);
   - `pipeline dbt parse`;
   - the web `lint` and `test` scripts.
3. **Files:**
   - new `.github/workflows/ci.yml`; delete `.github/workflows/.gitkeep`;
   - `pyproject.toml` and `uv.lock` (ruff in the dev group, `extend-exclude = ["notebooks"]`);
   - `pipeline/load_pbp.py`, `pipeline/tests/test_transforms.py` (the 2 lint fixes);
   - `CLAUDE.md`, `docs/decisions.md`, `docs/build-plan.md`.
4. **Tasks:**
   1. Add ruff and fix the two `.py` findings (no behaviour change).
   2. **`ci.yml`:**
      - `permissions: contents: read`;
      - per-ref concurrency, cancelling in-progress runs;
      - actions pinned to release tags at least 2 weeks old.
   3. **Job `python`:**
      - **Service:** `postgres:18` (user, password and database `ci`; `pg_isready` health check).
      - **Environment:** `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci` (a throwaway container, not a secret).
      - **Steps:**
        - `uv sync --locked`;
        - `uv run ruff check`;
        - `uv run pytest --ignore=pipeline/tests/test_raw_data.py`;
        - the two seed-only checks by node ID;
        - `uv run python -m pipeline dbt parse`.
   4. **Job `web`** (`working-directory: web`, Node 24, npm cache):
      - `npm ci`;
      - `npm run lint`;
      - `npx next typegen`;
      - `npx tsc --noEmit`;
      - `npm test`.
   5. **Fresh-checkout rehearsal:** clone into the scratchpad and run both jobs' commands there (Docker as the service).
   6. Commit `1.3: pull-request checks` on `main` and push; CI on `main` must be green.
   7. **Red checks (Rob's OK first).** Two throwaway branches:
      - `ci-red-typecheck`, with a type error in `web/lib/format.ts`;
      - `ci-red-pytest`, with `assert False` in `test_transforms.py`.

      Open a draft PR for each, check the right job is red, record the run URLs, then close both and delete the branches. CI has no secrets, so these never touch production.
   8. **No required check now (D3):** it would block direct pushes to `main`.
   9. The D1 follow-up commit.
5. **Decisions and rationale:**
   - **No `next build`:** it needs the database after 1.5, and Vercel's build is the build check.
   - **No Neon checks:** CI never holds production credentials.
   - **`dbt parse`:** it catches Jinja, YAML and ref errors, not SQL errors; that limit is written down.
   - **Notebooks aren't linted:** their committed outputs stay in step.
6. **Tests:** every CI command run locally; then the GitHub runs (main green, two PRs red).
7. **Risks and recovery:**
   - **A ruff release changes the rules:** pinned by the lock.
   - **Service start-up:** the health check waits for it.
   - **Preview deployments** for the throwaway PRs: harmless.
   - **Recovery:** revert the commit, or disable the workflow.
8. **Done-when:**
   - CI on `main` is green;
   - the type-error PR is red on `web`, the failing-pytest PR red on `python`;
   - `ci.yml` references no secret.
9. **Commit:** `1.3: pull-request checks`, then `1.3: record checks`.
10. **Dependencies:** 1.2; Rob's OK for the throwaway PRs.

---

## Step 1.4 — States and polish (to `docs/plans/states-and-caching.md` § 1.4)

> **As built (2026-10-22, Rob's decision).** Task 1's spike failed: the build accepted the structure, but every response was a 200. Team URLs are therefore checked in `web/proxy.ts` against `web/lib/team-codes.json`, and the page streams everything again (no `instant = false`, no temporary wait). The evidence, and the rest of 1.4 as built, are in `docs/decisions.md` ("Team URLs checked in Proxy", "States and polish"). The Done-when is unchanged.

1. **Objective:**
   - a real 404 for unknown team codes, before streaming;
   - a 308 for upper-case codes;
   - error boundaries, empty states, skeletons, metadata;
   - the small-sample rule on team pages;
   - touch-friendly hints.
2. **Reuse:**
   - `getTeamProfile()` (null for an unknown code);
   - `MIN_GAMES_FOR_INTERVAL` and its helper;
   - `catchError`;
   - Radix Tooltip and `InfoTip`;
   - `npx shadcn@latest add skeleton popover`;
   - the explorer's rejection pattern.
3. **Files:**
   - **Team routes:** `app/teams/[team]/page.tsx`; new `app/teams/[team]/not-found.tsx`.
   - **Error pages:** new `app/error.tsx` and `app/global-error.tsx`; `app/not-found.tsx` (a title).
   - **Shared components:** new `components/section-error.tsx` and `components/hint.tsx`; the shadcn `components/ui/skeleton.tsx` and `popover.tsx`; `components/info-tip.tsx` rebuilt on `Hint`.
   - **Skeletons:** one each for the team page, the explorer results, the leaderboard, This week and the teams index.
   - **Slug check:** new `lib/team-slug.ts` with its test.
   - **Small-sample rule:** `lib/splits.ts`, `lib/split-bars.ts`, `components/team/split-bars.tsx`, `splits-table.tsx`, This week's lines, and their tests.
   - **Empty states:** the explorer, leaderboard, This week and team pages.
   - **Docs:** `docs/decisions.md`, `docs/build-plan.md`; `CLAUDE.md` gets a line on the state patterns.
4. **Tasks:**
   1. **Spike:** the team page awaits `params`, checks the slug and awaits `getTeamProfile` before `<Suspense>`, with `export const instant = false` (commented). Run `npm run build`, then `next start`, then curl; measure the temporary wait. If the build refuses this structure → stop and hand back.
   2. **`parseTeamSlug`** → `ok` / `redirect` / `notFound`. Upper case → `permanentRedirect` to lower case, keeping the query string; `searchParams` is awaited only in that branch.
   3. **The team 404 page:** "No team with that code", its own title, the 32 team links (behind Suspense and `SectionError`).
   4. **Metadata:** `generateMetadata` (the team name and one line); the root not-found title.
   5. **Errors:**
      - `app/error.tsx`: a generic message, `retry()`, a home link;
      - `app/global-error.tsx`;
      - `SectionError` around each streamed data section.
   6. **Skeletons** the size of their content, replacing the "Loading…" text.
   7. **Empty states:**
      - HOU 1999–2001 reads "no games in these seasons";
      - no explorer matches;
      - a leaderboard value with no games;
      - no games this week.
   8. **Small samples:** below 3 games, "too few games for a range"; whiskers dropped, with the reason in the accessible name. Recount the 154 of 1,247 rows (2024–26) and record it.
   9. **`Hint`:** a Tooltip with a mouse, a Popover on `(hover: none)` (`useSyncExternalStore`, server snapshot "hover").
   10. **Check it**, then commit, push, run the live checks, and make the D1 follow-up.
5. **Decisions and rationale:**
   - **404 in the page, not Proxy** (agreed).
   - **Section boundaries outside `<Suspense>`,** so the rest of the page renders.
   - **A failure before streaming is a real 500.**
   - **Redirects keep the query string.**
6. **Tests and commands:**
   - **Vitest:** `parseTeamSlug` (`buf`, `BUF`, `b-u-f`, `xyz`, the empty string); the small-sample cut at 2 and 3 games; the empty-result builders.
   - **Curl** on a local `next start` and live:
     - `/teams/xyz` 404, `/teams/buf` 200, `/teams/BUF` 308 (`Location: /teams/buf`);
     - the query string kept;
     - `/nope` 404.
   - **Head check:** `curl -A "facebookexternalhit/1.1"` for every route, since metadata streams into `<body>` for normal user agents.
   - **Error states:** once, with `docker compose stop db` / `start db` locally (the data lives in the volume).
   - **Screenshots** (headless Chrome, outside the repo); `Hint` in the mobile preset; the regression set.
7. **Risks and recovery:**
   - **The build refuses the structure:** spike, hand back.
   - **The temporary wait:** measured; 1.5 removes it.
   - **Skeleton layout shift:** sized to the content.
   - **Hint hydration:** the server snapshot avoids a mismatch.
   - **Recovery:** revert; no database change.
8. **Done-when** (agreed plan):
   - the curl codes, locally and live, with the 404 inside the site layout;
   - each empty and error state shown once;
   - titles and descriptions in the HTML head;
   - tests, lint and build pass.
9. **Commit:** `1.4: states and polish`, then `1.4: record checks`.
10. **Dependencies:** 1.3. No Neon or Vercel setting changes.

---

## Step 1.5 — Caching and the refresh route (to `docs/plans/states-and-caching.md` § 1.5; D5 approved)

> **As built (2026-10-22).** Built as written, with three points the 1.4 changes settled:
> - **No pre-stream lookup to cache.** After 1.4 the team page streams everything, and Proxy checks the code, so there was no wait to remove. `generateStaticParams` lists the 32 codes from the cached `getTeams()`; the header and the season table are in each prerendered shell. The range bar, headline figures, splits and the sparkline's shading stream: the shading arrives through a `<Suspense>` slot in the header, with an unshaded sparkline in the shell.
> - **No `instant = false`.** The build accepted the structure without it.
> - **The root not-found page still reads no data** (1.4's rule); showing team names there is in the parking lot.
>
> Results, measurements and the guarantees table: `docs/decisions.md` ("Caching and the refresh route").

1. **Objective:**
   - every query cached under one tag and one lifetime;
   - static shells;
   - a secret-protected `POST /api/revalidate`;
   - `pipeline refresh`;
   - **cache behaviour verified and documented only as far as Next 16.4.1 and the measurements support.**
2. **Reuse:**
   - `lib/queries.ts` (plain, serializable arguments);
   - `requests` and `dotenv`;
   - the `secrets.token_urlsafe` / `dotenv.set_key` pattern;
   - the browser pane, for router behaviour.
3. **Files:**
   - **Config and queries:** `web/next.config.ts`; `web/lib/queries.ts`; new `web/lib/cache.ts`.
   - **Pages:** `web/app/teams/page.tsx`; `web/app/teams/[team]/page.tsx`; `web/components/team/team-header.tsx` and `win-sparkline.tsx`.
   - **Refresh route:** new `web/app/api/revalidate/route.ts`; new `web/lib/refresh-auth.ts` with its test.
   - **Refresh command:** new `pipeline/refresh.py`; `pipeline/__main__.py`; new `pipeline/tests/test_refresh.py`.
   - **Docs and env:** `.env.example`, `CLAUDE.md`, `docs/decisions.md`, `docs/parking-lot.md`, `docs/build-plan.md`.
4. **Tasks:**
   1. **Baseline timings first.** `time_starttransfer` for the first and repeat visit of `/`, `/teams`, `/teams/buf`, `/teams/buf?from=2016&to=2025`, `/explorer`, `/leaderboards` and `/this-week`: locally now, and live just before the push.
   2. **The profile:** `cacheLife.marts = { stale: 300, revalidate: 86_400, expire: 31_536_000 }`. Then `'use cache'`, `cacheLife('marts')` and `cacheTag(MARTS_TAG)` on all 10 query functions.
   3. **Pages:**
      - `/`, `/teams` and `/this-week` fully static (drop `connection()`);
      - `/teams/[team]`: `generateStaticParams` (32 codes); the header and season table in the shell; the range controls, headline stats, splits and sparkline shading streamed.
   4. **The route's auth check.** `checkRefreshAuth(header, secret)` → `ok` / `unauthorized` / `unconfigured`: an empty secret counts as unconfigured; the SHA-256 digests are compared with `timingSafeEqual`.
   5. **The route, POST only:** 503 when unconfigured; 401 with an empty body; otherwise `revalidateTag(MARTS_TAG, { expire: 0 })` → 200 `{ revalidated: true, at }`, `no-store`. GET → 405. Nothing is logged.
   6. **The secret:** generated into `.env` and `web/.env.local` unprinted; the name in `.env.example`.
   7. **`pipeline refresh --site URL`:**
      - POSTs with the secret, retrying network errors and 5xx 3 times with backoff;
      - **never retries 401 or 503** (configuration errors);
      - then GETs the main pages, expecting 200, and prints each status and time;
      - distinct exit codes: 0 ok, 1 refresh refused or failed, 2 a page check failed;
      - never prints the secret.
   8. **`npm run build`:** save the route table.
   9. **Run the local verification matrix** (below).
   10. **Hand back to Rob:**
       - add `REVALIDATE_SECRET` in Vercel (Production), click-by-click;
       - check whether Preview builds get `DATABASE_URL`.
   11. **Push and run the live verification matrix** (below). If it fails → stop and hand back.
   12. Write the **freshness guarantees** into `decisions.md`, then the D1 follow-up.
5. **What the site guarantees.** Written into `decisions.md`. Wording comes from the installed docs; a row marked *measured* is only stated as fact after the live probe.

   | Situation | Prerendered shells (`/`, `/teams`, `/this-week`, the 32 team shells) | Request-time sections (anything read from the query string) | A browser tab already open |
   | --- | --- | --- | --- |
   | After a successful refresh | The next request re-renders, blocking, then serves from cache | Old in-memory entries are invalidated on the instance that took the POST. **Other warm instances: measured.** A cold instance always re-queries | Client-side navigation may reuse its copy for up to 5 min (`stale: 300`); a reload always asks the server (`max-age=0, must-revalidate`) |
   | Refresh failed or never sent | Old data until a later refresh, or the first request after 24 h (served old once, then regenerated), or the next deploy (builds read Neon) | Mostly current: serverless entries usually don't persist. **Warm instances can keep old entries up to 24 h: measured** | As above |
   | After a deploy | Built from Neon at build time | Fresh (cache keys include the build ID) | Version-skew handling is Next's |

   Not claimed:
   - that every instance drops its old entries at the moment of the refresh;
   - that a page's shell and its streamed sections always come from the same load. Between a dbt build and its refresh, a page can show an older shell beside newer sections; with 1.6's gate both are tested data.
6. **Local verification matrix** (Docker, `next start`, single instance; every value changed is in the **local** marts):

   | # | Scenario | Expected |
   | --- | --- | --- |
   | L1 | Change BUF's `team_nick` in local `marts.dim_teams`; send no POST | `/teams/buf` (shell) and `/teams/buf?from=2016` (request-time) both still show the old name: a missed refresh leaves cached pages visible |
   | L2 | POST with a wrong secret; then with `REVALIDATE_SECRET=` empty on `next start` | 401, then 503; the pages **still old**: a failed refresh invalidates nothing |
   | L3 | `pipeline refresh` with the server stopped | Retries, exit 1, a clear message, no secret printed |
   | L4 | Correct `pipeline refresh` | 200; the next request to both pages shows the new name; the page checks pass: **recovery after a failed refresh** |
   | L5 | Browser pane: open `/teams/buf` *before* L4; after L4, follow site links away and back within 5 min; then reload | The client navigation may show the old name (router `stale`); the reload shows the new one. Recorded as observed |
   | L6 | Temporary, **uncommitted** build with `revalidate: 60, expire: 300`: change the value, no POST, wait 61 s, request twice; then idle past 300 s and request | 1st request old (served while regenerating), 2nd new; after `expire` the request waits and is new. Then restore the config, rebuild, `git diff` empty: the time-based safety net works as documented |
   | L7 | GET `/api/revalidate` | 405 |
   | L8 | Restore: `dbt build --select dim_teams`, then refresh | Original value back |

7. **Live verification matrix** (Vercel):

   | # | Check | Expected |
   | --- | --- | --- |
   | V1 | The route table in the Vercel build log; the shells' `x-vercel-cache` | As in Done-when; HIT on repeat |
   | V2 | Repeat-visit timings against the baseline | Faster for shells. Request-time pages are recorded as measured (they may not be faster, since serverless memory isn't shared) |
   | V3 | Wrong secret, GET | 401, 405 (503 shown locally only; production's secret stays set) |
   | V4 | `pipeline refresh` | 200; each shell's next request re-renders (not HIT), then HITs again |
   | V5 | **The data-change probe** (needs a real production data change; **Rob's explicit approval**, see below) | Before: record the probe values. After the load and build, *before* the POST: shells still old (a missed refresh), request-time probes old or new counted per request. After the POST: every probe new on 10 fresh requests over 10 minutes. The browser pane shows L5's behaviour live |
   | V6 | **The decision rule** | If any request-time probe still shows old data after the POST: stop and hand back, with the counts and the options (a shorter shared `revalidate`, or request-time sections left uncached; `use cache: remote` stays excluded unless Rob reverses the 10-19 decision) |

   **V5's data change.**
   - **Probes:** BUF's 2026 record on `/teams/buf` (shell season table) and `/teams/buf?from=2026&to=2026` (streamed headline); the week on `/this-week`; one `/leaderboards?…from=2026&to=2026` row.
   - **The change:** a routine production refresh, each command only after Rob says yes:
     1. `ingest` (current season);
     2. the raw data checks (read-only);
     3. `dbt build`, already passed locally on the same current-season data.

     Production is days stale, so new results change the probes. Before starting, a read-only count confirms that finished 2026 games are missing from Neon; if none are, the probe waits.
   - **If Rob declines:** V5 runs unchanged at 1.6's first production publish, the next natural data change, and 1.5's record says so. 1.5's agreed Done-when doesn't depend on V5.
8. **Tests and commands:**
   - **Vitest** `refresh-auth`: correct; wrong; missing; `Basic`; spaces; empty; different lengths.
   - **pytest** `test_refresh` (with `requests` monkeypatched): retries on 5xx and timeouts; no retry on 401/503; the exit codes; no secret in the output.
   - **The rest:** both matrices; the regression set.
9. **Risks and recovery:**
   - **Builds need the database:** a failed build leaves the previous deployment live.
   - **Warm instances keeping old entries after a refresh:** measured (V5); the decision rule hands back.
   - **The first visit after `expire: 0` waits:** absorbed by the page checks.
   - **A leaked secret** can force cache misses: rotate it in `.env`, `web/.env.local` and Vercel.
   - **The browser `stale` window:** documented, not hidden.
   - **L6's temporary config:** reverted and checked with `git diff`.
   - **Recovery:** revert the commit (the route is additive), or a later refresh.
10. **Done-when** (agreed, unchanged):
    - the route table;
    - repeat visits measurably faster, locally and live;
    - 401, 405 and 503;
    - a POST refreshes a changed value;
    - tests, lint, build and pytest pass.

    **Also recorded before the tick:** both matrices, the guarantees table, and V5 (or its explicit move to 1.6).
11. **Commit:** `1.5: caching and the refresh route`, then `1.5: record checks`.
12. **Dependencies:** 1.4; Rob's Vercel variable; Rob's approval for V5's production refresh.

---

## Step 1.6 — Nightly refresh and run records (D4, D6 approved)

1. **Objective:**
   - a scheduled, unattended nightly job with per-source run records and a footer freshness stamp;
   - safe reruns;
   - **a publication step that only moves data the same build has just tested into `marts`**;
   - every deliberate failure test run off production.
2. **Reuse:**
   - `ingest()` and the loaders;
   - `upsert_dataframe`'s single transaction and the empty-season refusal;
   - `run_dbt.run()`;
   - `test_raw_data.py`;
   - `pipeline refresh`;
   - the `-- depends_on:` pattern;
   - `web_reader`'s marts-only grants;
   - `SectionError`;
   - `npm run db:pull`.
3. **Files:**
   - **Python:**
     - new `pipeline/sql/run_records.sql`, `pipeline/runs.py`, `pipeline/tests/test_runs.py`, `pipeline/tests/test_publish.py`;
     - `pipeline/run_dbt.py` (`publish()`);
     - `pipeline/__main__.py` (independent loaders, exit codes, `--simulate-failure`, `publish`);
     - `pipeline/load_weather.py` (a rate limit is a failure);
     - `pipeline/refresh.py` (the stamp check);
     - `pipeline/tests/test_raw_data.py` (the `advisory` marker) and `pyproject.toml`.
   - **SQL checks:** new `latest_run_loads.sql`, `marts_table_oids.sql` and `candidate_schemas_unreadable.sql` in `pipeline/sql/checks/`.
   - **dbt:**
     - `transform/macros/generate_schema_name.sql` (an optional schema suffix);
     - new `transform/tests/simulated_failure.sql`;
     - `transform/models/staging/_sources.yml`;
     - new `transform/models/marts/data_freshness.sql`; `_marts.yml`.
   - **Web:** `web/drizzle/schema.ts`; `web/lib/queries.ts`; `web/lib/format.ts` with its test; new `web/components/data-updated.tsx`; `web/components/site-footer.tsx`.
   - **Workflow:** new `.github/workflows/nightly.yml`.
   - **Docs and env:** `.env.example`, `CLAUDE.md` (production builds use `pipeline publish`), `docs/data-model.md`, `docs/decisions.md`, `docs/parking-lot.md`, `docs/build-plan.md`.
4. **Publishing safety: what is and isn't guaranteed (revision 1).**

   **The safeguard: verify, then publish, from one frozen snapshot.** `uv run python -m pipeline publish` does everything below inside one database transaction that holds a lock on raw:
   1. **Freeze raw.** On its own owner connection: `BEGIN`, then `LOCK TABLE` every table in schema `raw` (read from the catalog at run time, so later raw tables are covered) `IN SHARE MODE`, with `lock_timeout = 5min`.
      - Postgres's SHARE lock lets readers through (dbt's and pytest's SELECTs) but makes every INSERT, UPDATE, DELETE, TRUNCATE or ALTER wait until the lock is released.
      - It also records the **raw fingerprint F0**: per table, the row count plus `max(_loaded_at)`, or `max` of the start/finish times for the two run-record tables.
   2. **Raw gate:** `pytest pipeline/tests/test_raw_data.py -m "not advisory"`, run as a subprocess while the lock is held.
   3. **Candidate:** a full `dbt build --vars '{schema_suffix: _candidate}'`. `generate_schema_name` appends the suffix, so every seed, view and table lands in `staging_candidate` / `marts_candidate`, and all tests run there. `web_reader` has no access: its grants and default privileges are on `marts` only.
   4. **Publish:** only if steps 2 and 3 were completely clean, the normal `dbt build` into `staging` / `marts`, with every test run again.
   5. **Equivalence checks:**
      - the raw fingerprint F1 must equal F0, which shows the lock held and both builds read the same raw rows;
      - every mart's row count in `marts` must equal `marts_candidate`'s.
   6. `COMMIT`, releasing the lock. Log the summary.

   - **Why the published marts equal the tested ones.** Both builds:
     - read the same committed raw rows (the lock, then F0 = F1);
     - use the same seeds and code (one checkout, one process);
     - run SQL with no clock, no schema names and only total orderings (all verified).
   - **Self-check:** the OIDs of the `marts` tables are recorded before step 3. On any failure before step 4, they're confirmed unchanged and the log says "marts untouched (N tables)".
   - **Exit codes:**

     | Code | Meaning | Marts |
     | --- | --- | --- |
     | 0 | Published | replaced |
     | 1 | The candidate failed | untouched |
     | 2 | The publish stage failed | partly replaced, each a tested version |
     | 3 | An equivalence check failed | published; investigate |
     | 4 | The raw gate failed | untouched |
     | 5 | The lock wasn't acquired | untouched |

   - **Cost:**
     - Neon compute: about 40 s more a night;
     - Neon storage: about 18 MB for the candidate schemas;
     - writers wait while the lock is held, at most the publish's 2–3 minutes;
     - no new service.

   **The limits of "the same raw data":**
   - **The lock only covers the window it's held.** Between the ingest step finishing and `publish` taking the lock, raw is protected only by the nightly's concurrency group and the rule of no manual production loads during a nightly run. A change in that gap is checked by the gate and the candidate before anything is published, so it is still tested data.
   - **A dropped lock connection releases the lock.** If raw then changes, F1 ≠ F0 catches it after publication (exit 3: a red run). The marts it published still passed stage 4's own tests.
   - **The fingerprint sees every write the pipeline makes,** because `upsert_dataframe` sets `_loaded_at` on every insert and update, and a delete lowers the count. A manual SQL UPDATE that doesn't touch `_loaded_at` would escape the fingerprint, but not the lock.
   - **"Equal" means equal rows, and values equal within floating-point rounding.** With a parallel plan, Postgres can add `team_game_stats`' EPA sums in a different order and differ in the last bits.
     - **Nightly:** compares row counts only, since a full comparison would cost Neon egress every night.
     - **Rehearsals:** `publish --compare` reads both versions of every mart and compares every value (relative tolerance 1e-9), run locally and on the test branch.
   - **It says nothing about whether raw is *correct*.** That's the raw gate's and the tests' job.

   | Failure | What the site can show | Guaranteed by |
   | --- | --- | --- |
   | A loader fails | No change; that raw table stays as it was | One transaction per upsert; the site never reads raw or staging (`--check`) |
   | Schedules (required) fails | No change; neither dbt stage runs | Exit code 2 → the workflow skips both stages |
   | The raw gate fails (`-m "not advisory"`, inside `publish`) | No change | `publish` stops before any dbt stage (exit 4) |
   | **Any dbt test fails in the candidate** | **No change; `marts` is untouched** (OIDs checked) | `publish` runs the publish stage only after a clean candidate |
   | The publish stage stops midway (e.g. a dropped connection) | Some marts new, others old; each a tested version | The same frozen raw as the clean candidate |
   | The refresh fails | Neon holds new, tested marts; pages keep the previous render until a later refresh, the 24 h safety net or a deploy (1.5's table) | — |
   | An optional source fails (teams, weather, pbp) | Tested marts built on that source's previous copy (e.g. new scores with plays pending); the run is red; `data_freshness` shows the source's last success | Tests; the freshness mart |

   **Residual risk, stated plainly:**
   1. **No atomic switch across marts.** Stage 2 replaces them one at a time over about 40 s, so a page rendered then can mix old and new marts; both versions passed the tests. A true atomic switch would mean renaming whole schemas and re-granting `web_reader` inside one transaction every night: disproportionate for Phase 1 (parking lot).
   2. **"Tested" means passed the raw checks and the dbt tests.** A defect no test covers is published like any other data.
   3. **The stages read identical raw data only while the lock holds** (see the limits above). Rule: no manual production load while a nightly run is in progress.
   4. **A manual `pipeline dbt build` against Neon bypasses the gate.** `CLAUDE.md` changes so every production build uses `pipeline publish` (full build; `--full-refresh` passed to both stages).
   5. **Every test failure blocks, critical or not.** That's stricter than 5.8's eventual design: a minor failure holds back all fresh data until it's fixed, and the stamp makes this visible. 5.8 decides which failures may still publish.

   **Recovery:**
   - **A red run:** read the failed step, fix it, rerun (idempotent).
   - **Bad source data:** after upstream fixes it, `ingest --only X --seasons Y`, then `publish`, both with Rob's OK.
   - **Wrong data that passed the tests:** fix the code (the commit goes through CI), rerun the nightly, and add the missing test.
   - **Emergency:** disable the workflow; the cached pages keep serving.
   - **Last resort:** the 1.2 restore points.
5. **Tasks:**
   1. **Run records.** `run_records.sql` (idempotent, commented):
      - **`raw.pipeline_runs`:**
        - `run_id uuid` PK;
        - `trigger`, `target`;
        - started and finished times;
        - `status` (CHECK running / success / partial / failed / abandoned);
        - `git_sha`.
      - **`raw.source_loads`:**
        - (`run_id` FK, `table_name`) PK;
        - `seasons int[]`;
        - `status` (CHECK success / failed);
        - rows inserted, updated, unchanged and deleted;
        - a sanitized `error`;
        - `nflreadpy_version`;
        - times.
   2. **`runs.py`**, on its own autocommit connection:
      - `ensure_tables`;
      - `start_run`, which marks `running` rows older than 3 h `abandoned`;
      - `record_load`;
      - `finish_run`;
      - `sanitize_error` (strips URLs and passwords, caps the length);
      - a `schema` parameter for tests.
   3. **`ingest`:**
      - loaders run independently and each outcome is recorded;
      - `REQUIRED = {"schedules"}`;
      - exit codes 0 / 1 (optional failed) / 2 (required failed, or the records can't be written);
      - `--simulate-failure TABLE`;
      - loaders injectable for tests.
   4. **`load_weather`:** a rate limit that leaves a season unloaded raises after the finished seasons are upserted.
   5. **Raw gate:** `@pytest.mark.advisory` on `test_schedule_corrections_still_needed` and `test_mislabelled_open_air_game_has_weather` ("upstream changed, revisit", not bad data). `publish` runs the rest under its lock.
   6. **dbt:**
      - `generate_schema_name` appends `var('schema_suffix', '')`. With no var it behaves exactly as now: a local `dbt build` gives the same schemas and passes.
      - `simulated_failure.sql` returns a row only when `var('simulate_test_failure', false)` is true; it's a no-op otherwise.
      - Two new sources.
      - `data_freshness` (one row per source: the last success with its seasons and rows; the last attempt with its status), declared `-- depends_on:` every mart so it builds last and doesn't advance if anything upstream fails.
   7. **`publish()` in `run_dbt.py`:** the lock, the F0 fingerprint, the raw gate, the OID snapshot, the candidate, the publish stage, the equivalence checks, commit (exit codes in the table above).
      - `--simulate-test-failure` passes the var to the candidate only.
      - `--compare` (rehearsals only) runs the full value comparison.
      - Also `--full-refresh`, passed to both stages.
   8. **Web:**
      - `npm run db:pull`;
      - `getDataFreshness()` (cached, `marts` tag);
      - `DataUpdated` renders `<time dateTime="…UTC…">Data updated Tue Oct 21, 5:41 am ET</time>` (formatted in `America/New_York`, unit-tested across daylight saving time), inside Suspense and `SectionError`.
   9. **`pipeline refresh --expect-stamp`:** after the POST, reads the newest stamp from `marts.data_freshness` and checks that every main page's `<time dateTime>` matches, retrying for up to 2 minutes; exit 2 if not. This is the automated proof that a refresh reached the visible pages.
   10. **`nightly.yml`:**
       - **Triggers:** `schedule: "30 9 * * *"` (09:30 UTC = 5:30 am EDT / 4:30 am EST) and `workflow_dispatch`, with inputs:
         - `target`: production (default) | test;
         - `simulate_failure`: none | weather | schedules | dbt_test.
       - **Environment:** the job uses the **GitHub Environment** named by `target`, each with its own `DATABASE_URL` secret. With no `||` fallback between secrets, a missing test secret can never fall through to production. The `production` environment also has `REVALIDATE_SECRET` and is limited to the `main` branch.
       - **Guard step:** fail at once if `simulate_failure != none` while the target is production.
       - **Settings:** `permissions: contents: read`; `concurrency: nightly-<target>`, never cancelling; 45-minute timeout; the Open-Meteo cache restored and saved even on failure.
       - **Steps:**
         1. ingest (captures its exit code);
         2. `pipeline publish` (the raw gate, candidate, publish and equivalence checks under one lock), skipped when ingest exits 2;
         3. a **"publish decision" step** that logs and outputs `published=true/false` from publish's exit code;
         4. `pipeline refresh --expect-stamp`: production only, when published;
         5. the advisory raw checks;
         6. a final step that fails the run if any earlier stage failed.
   11. **Local rehearsal** (Docker plus a local `next start`, real commands):
       - a normal run with `publish --compare` (every mart identical within the tolerance);
       - `--simulate-failure weather`;
       - `--simulate-failure schedules`;
       - `publish --simulate-test-failure`;
       - **a lock check:** while `publish` runs, `ingest --only teams` in a second terminal waits until publish commits, and F0 = F1;
       - a rerun.

       Expected results as in the matrix below, with `marts_table_oids.sql` before and after.
   12. **Hand back to Rob (click-by-click):**
       - **Neon branch:** create `nightly-test` from the production branch's head (3 of 10 branches).
       - **GitHub Environments:**
         - `production`: `DATABASE_URL` (= `.env`'s `NEON_DATABASE_URL`) and `REVALIDATE_SECRET`; deployment branches limited to `main`;
         - `test`: `DATABASE_URL` (the `nightly-test` owner URL from Neon's Connect dialog);
         - the repository variable `SITE_URL`.

         Values are copied from `.env` or the Neon console straight into GitHub, never into chat.
   13. **Neon production, expand (stop for Rob before each command):**
       1. `ingest` creates the run tables;
       2. `pipeline publish` creates the candidate schemas and `data_freshness`; all tests pass;
       3. `create_web_reader --check` shows marts 10 of 10;
       4. `candidate_schemas_unreadable.sql` shows `web_reader` has no USAGE on either candidate schema;
       5. record the storage.
       - If 1.5's V5 was moved here, this publish is its data change: probes before, observation, then `pipeline refresh`.
   14. Commit `1.6: nightly refresh and run records` and push; Vercel deploys the footer (the mart already exists).
   15. **Rehearsal on the `test` target** (Rob's OK; `gh workflow run nightly.yml -f target=test -f simulate_failure=…`). Only the `nightly-test` branch is written; there's no refresh. Expected results:

       | Scenario | Run | dbt | `published` | Marts on the test branch | `source_loads` |
       | --- | --- | --- | --- | --- | --- |
       | none | green | both stages | true | replaced (new OIDs) | all success |
       | weather | red | both stages | true | replaced | weather failed, others success |
       | schedules | red | skipped | false | untouched | schedules failed |
       | dbt_test | red | candidate failed, publish skipped | false | **untouched** (OIDs logged) | all success |
       | none, rerun, with `--compare` | green | both stages | true | replaced; identical to the candidate | 0 data rows changed |

   16. **Production, normal operation only:**
       - **A manual dispatch** (target production, no simulation; Rob's OK first): green; `--expect-stamp` passes; the live footer stamp advances with no redeploy.
       - **Then the scheduled run** at 09:30 UTC fires on its own (`gh run list --event schedule`).
       - **Read-only checks:** `latest_run_loads.sql`, `--check`.
   17. **Record:** run durations, the Neon compute estimate, storage (the candidate schemas, the test branch's divergence). Then the D1 follow-up after the scheduled run.
6. **Decisions and rationale:**
   - **The candidate build** is the smallest guarantee that uses only existing tools: dbt, one macro line, two schemas. It closes the mart-level gap D4 had left to 5.8, and 5.8 keeps its job of deciding which failures may still publish.
   - **A SHARE lock rather than a copy of raw.** Postgres already guarantees the frozen snapshot, while copying about 190 MB of raw every night would cost storage and compute.
   - **Environments rather than plain secrets,** so the test target is isolated by construction.
   - **`simulate_failure` only with the test target,** so production can't be fault-injected by accident.
   - **`pbp` is optional**, and the raw gate's 3-day check blocks a lasting gap.
   - **Daily all year** is cheap.
7. **Tests and commands:**
   - **pytest (pure):**
     - `sanitize_error`;
     - the ingest exit codes and the simulation (fake loaders);
     - `publish()` with a fake dbt runner and a fake gate:
       - the order (lock → gate → candidate → publish → checks);
       - a gate or candidate failure means the publish stage is never invoked;
       - a fingerprint or row-count mismatch gives exit 3;
       - the simulation var reaches the candidate only;
       - every exit code;
     - `refresh --expect-stamp` (stamps match, mismatch, retry).
   - **pytest (`local_only`, also in CI):**
     - run records in a throwaway schema; the constraints; stale runs abandoned;
     - the fingerprint helper (an upsert changes it; a read doesn't);
     - the SHARE lock makes a concurrent INSERT wait (`lock_timeout` on the second connection proves it).
   - **Vitest:** the ET formatter.
   - **dbt:** a normal local build still passes with no var; the candidate build passes with the var.
   - **The rest:** the local rehearsal, the test-target matrix, the production checks.
8. **Risks and recovery** (beyond the safety section above):
   - **GitHub scheduling:**
     - in UTC, delayed under load (hence :30), and only from `main`;
     - **turned off after 60 days without repository activity**, so the offseason re-enable goes into 5.10's runbook.
   - **Publication timing:** 09:30 UTC is after Monday-night games and nflverse's overnight builds; stat corrections land on later nights through idempotent upserts.
   - **Neon limits:** two builds and the 5-minute suspend come to about 2–12 of the 100 CU-hours a month (an estimate; Rob reads the usage after a week). Storage: the candidate schemas about 18 MB, and the test branch's divergence, both counted in 2.1.
   - **Credentials:**
     - environment secrets reach only their own steps, and GitHub masks them;
     - `sanitize_error` keeps connection strings out of the records;
     - nothing is echoed;
     - fork PRs can't run this workflow;
     - `production` is limited to `main`.
   - **A test branch out of date with production:** Rob can "Reset from parent" in Neon before a later rehearsal (destructive to the test branch only).
9. **Done-when** (agreed; the broken-test item now runs on the test target, per revision 2):
   - a manual production run is green, and a scheduled run fires on its own;
   - the footer stamp advances without a redeploy (`--expect-stamp` plus the live footer);
   - a deliberately broken dbt test turns the run red and skips the refresh, with `marts` left untouched (`simulate_failure=dbt_test` on `nightly-test`, plus the local rehearsal);
   - a forced weather failure is recorded in `raw.source_loads` while the other tables still load (local and on the test target);
   - a rerun changes no data row counts.
10. **Commit:** `1.6: nightly refresh and run records`, then `1.6: record checks` (after the scheduled run).
11. **Dependencies:** 1.5, 1.3, 1.2. Rob: the test branch, the environments, each production Neon command, each dispatch.

---

## Phase 1 end-to-end verification checklist

- [ ] `git ls-remote --tags origin foundation` → `cfbf291`; the `foundation` branch counts match; the dump restores locally.
- [ ] `create_web_reader --check`: every mart readable (10 of 10), staging and raw 0, writes refused; `candidate_schemas_unreadable.sql`: no USAGE.
- [ ] CI is green on `main`; the two throwaway PRs were red; `ci.yml` has no secrets.
- [ ] Live 404 / 200 / 308 (query kept); titles and descriptions in the head (HTML-limited-bot user agent).
- [ ] Both 1.5 matrices recorded: a failed refresh leaves cache untouched; a missed refresh is bounded by the 24 h safety net (L6); recovery by a later refresh (L4, V4); browser staleness ≤ 5 min with a reload fresh (L5); warm-instance behaviour after a refresh measured with every probe new (V5), or the hand-back taken.
- [ ] The guarantees table in `decisions.md` matches what was measured.
- [ ] The test-target rehearsal matrix: all 5 rows as expected; `dbt_test` and `schedules` leave `marts` untouched (OIDs).
- [ ] The same raw data for both builds: F0 = F1 on every publish; `--compare` shows the candidate and published marts identical (locally and on the test branch); the lock made a concurrent load wait.
- [ ] The latest scheduled production run is green; `--expect-stamp` passed; the footer stamp matches `marts.data_freshness`.
- [ ] The regression set passes locally: pytest, dbt build (no var), ruff, lint, tsc, Vitest, build.
- [ ] `decisions.md` has an entry per step with its evidence; build-plan boxes 1.1–1.6 ticked; `CLAUDE.md` (`pipeline publish`, `pipeline refresh`, the environments), `.env.example` and `data-model.md` match.
- [ ] Phase end: a summary for Rob, plus the checkpoint concepts:
  - what was preserved and why;
  - CI vs the nightly job;
  - how to roll back;
  - a nightly run step by step, including what the candidate build does and doesn't guarantee.

## Effort and complexity

| Step | Complexity | Estimate | Rob's time |
| --- | --- | --- | --- |
| 1.1 | — | done | — |
| 1.2 | Low | 1–2 h | Neon branch and counts (≈15 min), tag approval |
| 1.3 | Low–medium | 2–3 h | Throwaway PR approval |
| 1.4 | Medium–high | 4–6 h | Review of screenshots |
| 1.5 | Medium (the verification matrices add about 1.5 h) | 4–6.5 h | Vercel variable; V5 approval |
| 1.6 | High (candidate gate, environments, rehearsal; waits a night) | 6–9 h + 1 calendar day | Test branch, environments (≈15 min), Neon approvals, dispatches |
| **Total** | | **17–26.5 h**: 1–2.5 h above the plan's 14–24 h, all of it verification and safety, no new features | |

## Decisions (D1–D7 approved by Rob, 2026-10-21)

| # | Decision | Approved choice |
| --- | --- | --- |
| D1 | Commit boundary for post-push checks | Code commit, then a docs-only `1.x: record checks` commit with the tick |
| D2 | ruff findings | Fix the 2 in `.py` files; exclude notebooks |
| D3 | Required CI check | Not now; revisit at Gate D |
| D4 | Nightly safeguards | The raw gate (2 tests `advisory`), run inside `pipeline publish` under its raw lock; `data_freshness` built last. The candidate build (refinement 1) closes the mart-level gap D4 had left to 5.8 |
| D5 | Refresh command | `uv run python -m pipeline refresh` |
| D6 | Phase 0 code changes for 1.6 | `--simulate-failure`; the weather rate limit reported as a failure |
| D7 | 1.2 additions | `pipeline/backup_schema.py`, the local restore test, the counts SQL |

## Consistency with `CLAUDE.md`, the requirements and the build plan (checked 2026-10-21)

| Source | Point | Result |
| --- | --- | --- |
| `CLAUDE.md` | One step at a time; a session works only on its scoped steps; the plan saved in `docs/plans/` before any code | Consistent |
| `CLAUDE.md` | "Tick the step's box… (same commit)" | **Conflicts with D1.** Resolved when this plan was saved: D1 recorded in `decisions.md`, and the line in `CLAUDE.md` and the build plan's "How we work" names the follow-up commit |
| `CLAUDE.md` | Production dbt runs as `pipeline dbt build` with `DATABASE_URL` set to Neon | Consistent until 1.6, which switches the documented production command to `pipeline publish` (in 1.6's files) |
| `CLAUDE.md` | `.env` holds three connection strings | 1.5 adds `REVALIDATE_SECRET`; 1.5 updates `CLAUDE.md` and `.env.example` (planned) |
| `CLAUDE.md` | Expand → deploy → contract; stop before each Neon step; secrets never printed; screenshots outside the repo; Drizzle pull only | Consistent |
| `CLAUDE.md` | `docs/plans/` reference line names only `states-and-caching.md` | Updated when this plan was saved, to name `phase-1.md` |
| Requirements §0 | Back up before schema changes; one step at a time; no invented data; no new services or paid providers; secrets protected | Consistent (1.2's backup module, D1, no services, environment secrets) |
| Requirements §7, Phase 1 | Inventory; restore point; architecture and data ownership; states, metadata and protected invalidation that later pages reuse; a scheduled refresh with run records and freshness | Consistent. "Architecture and data ownership" is already met by `decisions.md` 2026-10-21 ("Stack and architecture") and the build plan's Architecture section; this plan adds no service. The one `marts` tag serves every later query. The existing pages' smoke checks are 1.4's and 1.5's curl matrices and `pipeline refresh`'s page checks |
| Requirements §6.2 | `raw.source_loads` "hash/schema version/notes" | The build plan's narrower column list is followed: `nflreadpy_version` is the version, `error` the notes, no hash. That's within "or existing equivalent"; not a conflict |
| Requirements §3.8, §8 | No raw SQL errors shown; protected revalidation; no logged credentials; idempotent, rerunnable, partial-failure-tolerant operations | Consistent |
| Build plan, Phase 1 | Step texts and Done-whens | Preserved. Agreed deviations in wording are each recorded in `decisions.md` when their step lands: D5 (a Python refresh command); the raw gate and candidate publish instead of one `dbt build`; GitHub Environments instead of repository secrets; the broken-test check on the test branch; V5 |
| Build plan | Effort 14–24 h | This plan estimates 17–26.5 h; the build plan already says to revise estimates after Phase 2, so it isn't edited now |
| Build plan | Storage budget; 5.8's critical tests | The candidate schemas (about 18 MB) and test-branch divergence are counted in 2.1. 5.8 later relaxes "every failure blocks" to "critical failures block" |

**Approvals during execution** (asked at the time, never assumed):
- **1.2:** push the tag; Rob creates `foundation`; read-only Neon connections announced.
- **1.3:** the throwaway branches and PRs (CI only, no production).
- **1.5:**
  - Rob adds `REVALIDATE_SECRET` in Vercel and checks Preview's `DATABASE_URL`;
  - **V5's routine production refresh** (ingest, read-only checks, `dbt build`), each command separately, or Rob defers V5 to 1.6.
- **1.6:**
  - Rob creates `nightly-test` and the two environments;
  - each production Neon command in the expand;
  - the test-target rehearsal dispatches (the test branch only);
  - the first production dispatch.

  No deliberate failure ever runs against production.
