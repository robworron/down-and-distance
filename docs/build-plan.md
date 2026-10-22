# Down & Distance — Build Plan

The development plan for Down & Distance, a fantasy football research application. It is self-contained: everything needed to build the current application is here or in the documents below.

- **Product requirements:** `docs/requirements.md`.
- **Decision record:** `docs/decisions.md`, the technical decisions and their reasons. It wins where it disagrees with this plan.
- **Data model:** `docs/data-model.md`, updated as each table is built.

Phase 0 is built. Phases 1–7 run in order, one step at a time.

## About the project

A free, public fantasy football research site. Each week a fantasy manager can see:
- how players' roles are changing;
- why their production moved;
- an honest projection with its uncertainty;
- two players side by side.

It stands on a foundation that is already built: an NFL data engineering, analytics and research platform. That foundation has nflverse and Open-Meteo pipelines, a tested dbt warehouse, a pre-registered statistical analysis, and team and situation research pages. The research pages stay available in a Research section.

**What it is**
- Built on nflverse weekly player stats, snap counts and rosters since 2016 (planned, Phase 2), beside the play-by-play and game data since 1999 that the foundation already loads.
- Every number is traceable from the page to its SQL and back to the source. Every average shows how many games it covers.
- Projections come from a simple, tested baseline first. A model replaces it only if it is more accurate on seasons it has never seen.

**Who it's for**
- **Rob, mainly:** a weekly tool for lineup and waiver questions. "What changed in this player's role, how could that affect this week, and how sure is the projection?"
- **Other fantasy managers** who want context beyond a box score.
- **Employers and interviewers:** the live site, the public repo and the write-ups show SQL, data modelling, statistics, forecasting with honest evaluation, an automated pipeline and agent-assisted development, end to end.

**How people access it.** In any browser, on desktop or phone. There are no accounts and no logins; every filtered view has a shareable link. The code is public on GitHub.

**What visitors can do today** (built, live at https://down-and-distance-chi.vercel.app/)
- Team pages: record and situational splits over any range of seasons, with confidence intervals and shrunk estimates.
- The situation explorer, leaderboards, and This week's games with the situations each team faces.

**What visitors will be able to do** (planned)
- See this week's games and jump to the players on either team (5.6).
- Search players by name; filter by position and team (5.1).
- Open a player's page: game-by-game fantasy points in Standard, Half-PPR or PPR, and how many touches, targets and snaps they got compared with their team and their own recent past (5.2).
- Scan the Opportunity Tracker for players whose role is growing or shrinking (5.3).
- Compare two players for the same week and scoring (5.4).
- See projected points with a range (or an honest "not available"), and the model's graded track record (6.9).
- Read how everything is calculated (5.5).
- Keep browsing the team and situation research under Research (5.6).

**How you'll use it after launch**
- It runs itself in season. A nightly job loads new games and stats, rebuilds the tables, makes projections for the next games, grades the last ones and refreshes the site. You check the "data updated" stamp and act on GitHub's email if a run fails.
- Each preseason (August): re-enable the scheduled job, check nflverse for data changes, re-run the evaluation.
- Show it: link it from your portfolio and walk through it in interviews.

**What it is not.** It isn't a league host, a betting or DFS tool, a news or injury aggregator, or a guaranteed prediction engine. It shows no odds and sells no picks. A projection is an estimate with a stated error, not advice.

**Launch, effort, cost**
- **Milestones:**
  - **Gate C, the Research Beta:** public, before projections.
  - **Gate D, the Reliable Weekly Application.**
  - **Gate E, the Predictive MVP:** v1.0.
  - **Gate F, the Portfolio-ready Release.**

  Their acceptance lists are under [Release milestones](#release-milestones).
- **Effort:** about 90–170 hours for Phases 1–7. Revise after Phase 2.
- **Cost:** $0 a month on free tiers: Vercel Hobby, Neon Free (1 GB), GitHub Actions on a public repo, Open-Meteo.
- **Environment:** built on Windows 10 Pro with Docker Desktop and the Claude Code desktop app.

## How we work

Every step is one small change that we build, verify and commit before the next one starts, so a bug never spans more than one step.

**Ground rules**
- Never start a step while the previous step's "Done when" check is failing. A failed check sends you back to fix the code inside the same step.
- When something breaks: read the whole error message, make one guess, test it, change one thing at a time.
- Before Claude Code writes anything, it explains the step's concept in 2–4 plain sentences.
- Claude Code writes all code, SQL, statistics and analysis included.
- After every SQL- or analysis-heavy step, Claude walks Rob through what was built, clause by clause, so he can explain it in interviews.
- One commit per step, starting with the step label, e.g. `2.3: load weekly player stats`. The step's box is ticked in the same commit, or, when part of the Done-when can only be checked after the push, in one docs-only follow-up commit `x.y: record checks` with that evidence.
- Judgment calls the plan doesn't settle are handed to Rob, with options, counts and a recommendation. Examples: scoring edge cases, participation rules, data corrections.
- Production changes go expand → deploy → contract. Stop for Rob before each Neon or Vercel step.
- Secrets live in `.env` files and GitHub secrets, never in the repo or the logs. `.env.example` lists the names only.
- Each phase ends with a checkpoint: the concepts you should now be able to explain out loud.
- **Nothing is invented.** No fabricated statuses, snap shares, forecasts or accuracy figures. A missing value shows as unavailable or pending, never as a guess or a zero.

## Decisions locked in

The stack: Next.js on Vercel, Python batch jobs on GitHub Actions, dbt, and Postgres on Neon, in one public repo.

| Decision | Choice | Why |
| --- | --- | --- |
| Web app | Next.js 16 (App Router), TypeScript, Tailwind 4, Drizzle (pull only), on Vercel | Already built and verified |
| Pipeline | Python batch jobs (uv, nflreadpy → **pandas**), run by GitHub Actions | Data changes after games; compute once, store the answer. pandas, not Polars (decisions 2026-10-16) |
| Transformations | SQL in dbt Core 1.x (`dbt-postgres`) | SQL is the core analyst skill; models are tested and documented |
| Database | PostgreSQL 18: Docker locally (port 15432), Neon Free in production | 214 MB of 1 GB used; the player tables add an estimated 165–360 MB ([Storage](#storage-and-operating-budget)) |
| Player data range | 2016 to present | Matches play-by-play. nflverse has no targets for 2003–08. |
| Positions | QB, RB (fullbacks included, confirmed in 3.1), WR, TE | No kickers or team defenses at launch |
| Season type | Fantasy views and models use the regular season; playoff rows are kept and flagged | Requirements §1.3 |
| Scoring | Standard, Half-PPR and PPR from one rules seed and one SQL macro | One definition, tested against hand-computed fixtures and nflverse's own points (0 mismatches in 188,522 player-games) |
| Player identity | GSIS player ID; never join on names | Stable across teams and seasons |
| Played vs did not play | From snap counts plus stats rows | 12.7% of appearances have no stats row ([Data sources](#data-sources-verified-2026-10-21)) |
| Projections | Baselines first; a ridge regression only if it beats them on the validation season; no LightGBM in the MVP | Interpretable first; complexity must earn its place |
| Forecast storage | An append-only table in `raw`, written by Python; graded by dbt in `marts` | Forecasts are history and can't be rebuilt; no circular dbt dependency |
| Evaluation seasons | Development 2017–2023 (walk-forward), validation 2024, test 2025 (opened once), live 2026 on | A true out-of-sample test before live weeks accumulate |
| Betting | No odds, lines, closing-line value or betting features. The research pages keep their cover % as built. | Requirements §1.3 |
| Images | No team logos, no player photos | Rights not established (decisions 2026-10-19; [Data sources](#data-sources-verified-2026-10-21)) |
| Infrastructure | No new services, queues, ML servers or LLM features | The batch stack fits ([Architecture](#architecture)) |

## Repo structure

Planned paths are marked ★; everything else exists.

```
down-and-distance/
├── pyproject.toml           one Python environment (uv)
├── docker-compose.yml       local Postgres 18
├── .env.example             names of required secrets, no values
├── README.md
├── web/                     Next.js app
│   ├── app/                 routes: /this-week, /players★, /players/[playerId]★, /opportunity★,
│   │                        /compare★, /methodology★, /performance★, /research/...★
│   ├── lib/queries/★        database queries by domain (split from lib/queries.ts in 5.1)
│   └── scripts/smoke.mjs★   route smoke checks (5.7)
├── pipeline/                Python: loaders, run records, projections
│   ├── load_player_stats.py★, load_players.py★, load_rosters.py★, load_snap_counts.py★
│   ├── runs.py★             pipeline_runs and source_loads records
│   ├── projections/★        baselines, model, forecast writer, archive export
│   ├── sql/                 SQL checks, web_reader grants, player_projections.sql★
│   └── tests/
├── transform/               dbt project
│   ├── seeds/               stadiums, situations, scoring_rules★, scoring_fixtures★,
│   │                        source_availability★, cancelled_games★
│   ├── models/staging/      one cleaned model per raw table (+4 player models★)
│   └── models/marts/        research marts + player marts★
├── notebooks/               01–06 situational research; 07–10★ player sources and analysis
├── docs/                    plan, requirements, decisions, data model, findings; later methodology, evaluation, operations
└── .github/workflows/★      ci.yml (pull requests) and nightly.yml (scheduled pipeline)
```

**Database layers** (`web_reader` can read `marts` only):

| Layer | Built (foundation) | Planned |
| --- | --- | --- |
| `raw` (loaded by Python) | `schedules`, `teams`, `game_weather`, `pbp` | `player_stats_weekly`, `players`, `rosters_weekly`, `snap_counts`, `pipeline_runs`, `source_loads`, `player_projections` (append-only) |
| `staging` (dbt views and seeds) | `stg_schedules`, `stg_teams`, `stg_game_weather`, `stg_pbp`, seeds | `stg_player_stats_weekly`, `stg_players`, `stg_rosters_weekly`, `stg_snap_counts`, seeds `scoring_fixtures`, `source_availability`, `cancelled_games` |
| `marts` (dbt tables) | `games`, `team_games`, `team_game_stats`, `team_seasons`, `dim_teams`, `dim_stadiums`, `mart_team_splits`, `mart_league_splits`, `situations` | `scoring_rules`, `data_freshness`, `fct_team_game_usage`, `fct_player_games`, `dim_players`, `mart_player_weekly`, `mart_player_opportunity`, `mart_player_pregame_features`, `player_projections_current`, `mart_projection_grades` |

## Architecture

The application is a batch product:
- data changes after games;
- projections are made nightly, not on request;
- every table is small;
- traffic is read-only and cacheable.

The stack serves that shape with no additional services.

```
nflverse (schedules, teams, play-by-play, weekly player stats, players, weekly rosters, snap counts) + Open-Meteo
  │  Python loaders: pandas, idempotent upserts, one run record per source            → raw
  ▼
dbt staging: types, team codes, GSIS IDs, pfr→gsis map                                → staging
  ▼
dbt marts: team and game research marts
         + fct_team_game_usage, fct_player_games, dim_players, mart_player_weekly,
           mart_player_opportunity, mart_player_pregame_features, data_freshness        → marts
  ▼
Python projections: read the feature mart, append to raw.player_projections            → raw
  ▼
dbt projection marts: player_projections_current, mart_projection_grades               → marts
  ▼
Next.js server components: web_reader (SELECT on marts only), cached under one tag, refreshed by a protected route
```

**Automation:**
- `ci.yml` on pull requests and pushes;
- `nightly.yml` daily at about 09:30 UTC: ingest → dbt build → forecast → dbt build of the projection marts → refresh → smoke check.

**Why it is shaped this way:**
- **Projections live in `raw`, grades in `marts`.** Python owns forecasts, and dbt never rebuilds them. dbt reads them as a source, so there is no circular dependency, and `raw` already means "loaded by Python". No new schema and no new grants are needed.
- **`web_reader` needs no change.** Its default privileges on `marts` cover every new mart.
- **Run records are raw tables.** `raw.pipeline_runs` and `raw.source_loads` are written by the pipeline and reach the site through `marts.data_freshness`.
- **No new services.** There is no ML service, queue, LLM feature, feature store, model registry, Playwright suite or ORM migration. A ridge model, if one earns its place, is a few lines of scikit-learn in the nightly job.

## Data sources (verified 2026-10-21)

These were checked with the installed nflreadpy 0.1.5 (Polars 2.0.0, pandas 3.0.6). Step 2.1 re-verifies them in a reproducible notebook and writes the per-source table in `docs/fantasy-source-audit.md`. "Skill" below means QB, RB, WR, TE and FB.

| Source (nflreadpy) | Coverage verified | Key and integrity | Role |
| --- | --- | --- | --- |
| `load_player_stats(summary_level="week")` | 1999–2026; 150 columns. 2026: regular-season weeks 1–6 (6,488 rows). 2025: weeks 1–22 (18,540 regular + 882 postseason). | `(player_id, game_id)` unique; `game_id` never null; 536 placeholder "Team" rows have no `player_id` (and no targets, carries or attempts) | **Required** |
| `load_snap_counts()` (Pro Football Reference, via nflverse) | 2012+. 2026: weeks 1–6. 2025: weeks 1–22. | `(game_id, pfr_player_id)` unique, no null IDs; listed team codes (OAK, SD) | **Required**: decides played vs did-not-play |
| `load_players()` | 24,859 players | `gsis_id` unique and never null; `pfr_id` ↔ `gsis_id` is 1:1 | **Required**: identity and the snap-count ID map |
| `load_rosters_weekly()` | 2002+. 2026: weeks 1–7, including the **upcoming** week. | `(season, week, gsis_id, team)` unique; 9 player-weeks on two teams (trades); 26 rows with null `gsis_id` (2025–26) | **Required**: current team, roster status, the participation spine |
| `load_schedules()`, `load_teams()`, `load_pbp()`, Open-Meteo | Loaded by the foundation | Existing tests | Required (schedules, teams); context (play-by-play, weather) |
| `load_injuries()` | 2009+; current through 2026 week 7 | Keyed by `gsis_id` | Not in the MVP (requirements §1.4) |
| `load_depth_charts()` | 1.23M rows for 2025–26; timestamped appends with no week | | Not feasible for the MVP |
| `load_participation()` | 2016–2025 only; FTN data, CC BY-SA 4.0, released after the postseason | | Not feasible in season |
| `load_ff_opportunity()` | 2025 weeks 1–22, 2026 weeks 1–6 | An expected-points model | After the MVP |

**Findings that shape the design**
- **Player data starts in 2016.** nflverse has almost no targets for 2003–2008 (season totals of 0–67, against 16,000–19,000 otherwise), and play-by-play starts in 2016.
- **Team codes differ by source.**
  - Player stats use today's franchise codes (`LV` in 2016's `2016_01_OAK_NO`); schedules and snap counts use the listed codes.
  - After OAK→LV, SD→LAC and STL→LA, team and opponent match the schedule for every 2016–2026 row except 2, which 2.6 explains.
  - Every source passes through `current_team()`.
- **Share denominators need every player.** nflverse's `target_share` equals targets ÷ the sum over *all* rows in that team-game, for 100% of rows. Non-skill players hold 0.13% of targets, 0.10% of carries and 0.06% of attempts, so `raw.player_stats_weekly` keeps every player with an ID.
- **Scoring identity.** On all 188,522 player-games with a `player_id` (2016–2026), the requirements' point rules reproduce nflverse's `fantasy_points` and `fantasy_points_ppr` with **0 mismatches**, provided that:
  - player special-teams return TDs score +6;
  - fumbles lost = sack + rushing + receiving fumbles lost.

  Without return TDs, 194 player-games differ; counting return fumbles (`fumbles_lost_total`), 432 differ. Half-PPR is exactly (Standard + PPR) / 2. Negative yardage is scored as given: 1,676 player-games with negative rushing yards, 629 receiving and 15 passing.
- **Snap counts are required, not optional.**
  - A player gets a stats row only if he recorded a stat. Of 65,965 regular-season skill appearances with an offensive snap (2016–2026), **8,381 (12.7%) have no stats row** (TE 4,042, WR 2,727, FB 864, RB 614, QB 134). Without snaps they would look like did-not-play games, and averages would be inflated.
  - The PFR→GSIS mapping covers 99.80–100% of rows in every season.
  - Team offensive snaps are recoverable (snaps ÷ share) in 5,689 of 5,708 team-games.
- **Rosters and point-in-time.** The weekly roster file already holds the upcoming week. But a week's `INA` status reflects game-day inactives, announced about 90 minutes before kickoff, so backtests use the previous week's roster. Every 2024–2026 skill player-game matched a roster row for the same team and week.
- **Publication timing** (nflverse data schedule):
  - player stats: nightly after game days, with stat corrections settling Wednesday into Thursday;
  - snap counts: four times a day, but they depend on Pro Football Reference's own schedule;
  - rosters and injuries: daily at 07:00 UTC;
  - participation: only after the postseason.
- **Weekly stats, not play-by-play.** Every MVP metric comes from weekly stats, snap counts and rosters: points, volumes, shares, snap share, efficiency and windows. Play-by-play stays team context and isn't reloaded. Red-zone or route roles would need its player IDs and a full reload, so they are after the MVP.
- **Licences and attribution.**
  - nflverse data is CC BY 4.0; attribute nflverse "and the provider it sourced the data from".
  - Snap counts are credited to Pro Football Reference.
  - FTN data (CC BY-SA 4.0) isn't used.
  - Open-Meteo is CC BY 4.0.
  - Player headshots are NFL-hosted with no established right to display, so they aren't shown.

## Storage and operating budget

- **Neon on 2026-10-21:** 214 MB of the Free plan's 1 GB (`raw.pbp` 183 MB, marts about 18 MB).
- **Free plan limits:** 100 CU-hours of compute, 5 GB egress, 10 branches; compute suspends after 5 idle minutes.

| Planned table | Rows (2016–2026) | Estimate |
| --- | --- | --- |
| `raw.player_stats_weekly` (about 45 columns, integers as `smallint`) | about 190,000 | 40–70 MB |
| `raw.snap_counts` | about 280,000 | 30–50 MB |
| `raw.rosters_weekly` (trims decided in 2.1) | 120,000–480,000 | 20–90 MB |
| `raw.players` | about 25,000 | 5–10 MB |
| Player marts | 70,000–110,000 each | 40–80 MB |
| Projection archive and grades | about 250,000, plus about 75,000 a season | 30–60 MB |
| **Total** | | **165–360 MB**, taking Neon to about 380–575 MB |

Step 2.1 stops the plan if the projected total exceeds 700 MB. Rebuilding a mart briefly needs space for both copies, and the archive grows each season.

**Other services:**
- **GitHub Actions:** free for public repositories.
- **Vercel Hobby:** suits a personal, non-commercial site.
- **Open-Meteo:** a nightly run fetches only the current season; a full rebuild in CI needs the 85 MB weather cache restored.

Any change in a provider's terms is a stop-and-ask.

## Risks and safeguards

| Risk | Safeguard | Steps |
| --- | --- | --- |
| Played-with-zero mistaken for did-not-play (12.7% of appearances) | Snap counts required; seven participation states; windows divide by played games | 2.5, 3.3–3.5 |
| Team codes differ by source; two rows unexplained | `current_team()` on every source; relationships tests | 2.6, 3.1 |
| Historical data isn't point-in-time (stat corrections, snap revisions, game-day inactives) | Availability lags and the cutoff rule; the previous week's roster; truncation and corrupted-future tests; stored live inputs and measured drift | 3.6, 6.5, 6.8 |
| Placeholder kickoffs and schedule changes | Each forecast stores the kickoff it knew; grading uses the actual kickoff (`after_kickoff`); only pre-kickoff forecasts are shown | 6.2, 6.3, 6.9 |
| Cancelled or postponed games (e.g. 2022 week 17 BUF–CIN); the upsert deletes stale schedule rows | No foreign key from forecasts to schedules; `void_cancelled` / `game_missing`; the `cancelled_games` seed | 3.4, 6.2, 6.3 |
| dbt publishes a mart before its tests run; one failing loader stops the others | Loaders run independently; critical tests at staging; refresh only on success | 1.6, 5.8, 5.9 |
| The forecast archive can't be reloaded, and Neon Free keeps only a short restore history | Append-only with a trigger; weekly export | 6.2, 6.8 |
| Stale production (no automation yet; GitHub turns off schedules after 60 days without activity) | Nightly job; freshness on every page; preseason re-enable in the runbook | 1.6, 5.10 |
| Stat corrections change grades | `provisional` for 10 days, then `final`; `/performance` uses `final` | 6.3 |
| Noisy 3-game trends; overclaiming accuracy | Raw counts beside changes; minimum samples; labels only from evidence; pre-registered splits; test season opened once | 4.1, 4.3, 6.1, 6.7 |
| Builds need the database once pages are cached | CI runs without a database; Vercel's build is the build check | 1.3, 1.5 |
| Licensing of snap counts, headshots and FTN data | PFR credited; no images; FTN unused | 5.6, 7.3 |
| In-season timing (the 2026 regular season ends in early January 2027) | Gates C and D don't need projections. If Phase 6 lands late, the remaining 2026 weeks are a short live test and 2027 is the first full live season. | — |
| Secrets in CI and logs | GitHub secrets and environment variables only; nothing echoed | 1.6, 7.4 |

## Change safety

These rules apply to every step.

- **Additive only.** New raw tables, dbt models and routes are added beside the foundation. No existing table or mart is dropped, renamed or retyped, and no existing column is removed. The research routes move in 5.6 behind 308 redirects, so links keep working.
- **Foundation constraints to respect:**
  - The site reads `marts.games`, `team_games`, `dim_teams`, `dim_stadiums`, `situations` and `mart_league_splits`. dbt model names are unique across the project; `games` is taken, `dim_players` and `player_*` are free.
  - `create_web_reader.py --check` writes to `marts.situations`, so that seed stays.
  - `stg_pbp` is a view that every consumer re-scans, so player models don't read it.
- **Production order.** Every Neon step is approved by Rob and goes expand → deploy → contract. Nothing is deleted from Neon without Rob's explicit approval.
- **Restore points** (1.2):
  - a git tag `foundation` on the commit 1.1 measured;
  - a Neon branch `foundation`;
  - a schema-only dump.

**Backout by layer:**

| Layer | Backout |
| --- | --- |
| Code (any step) | Revert that step's single commit; Vercel redeploys from `main` |
| New raw tables | Drop them (with approval); they reload from nflverse |
| New dbt models | Remove the model; the foundation marts were never altered |
| Routes and navigation | Remove the redirects and nav entries; the research pages only move, never change |
| Nightly job | Disable the workflow; the site keeps serving cached data |
| Projection archive | Never dropped; restored from the weekly export |
| Last resort | Restore the Neon `foundation` branch and check out the `foundation` tag |

## Open decisions

Each is decided at its step, with counts and a recommendation, as `CLAUDE.md` requires.

| Question | Options and counts | Recommendation | Step |
| --- | --- | --- | --- |
| Player special-teams return TDs | +6, matching nflverse; or excluded (194 player-games since 2016 change) | +6 | 3.2 |
| Fumbles lost on kick and punt returns | Offensive fumbles only, matching nflverse; or all (432 player-games change) | Offensive only | 3.2 |
| Special-teams-only appearances | Counted in per-game averages; or kept as their own state outside them | Own state, outside the averages | 3.3 |
| Fullbacks | Counted as RBs; or excluded | As RBs | 3.1 |
| Default scoring format in URLs | PPR, Half-PPR or Standard | Half-PPR | 5.2 |
| This Week rollover | By unfinished games (stalls when data is stale); or by date | Tuesday 12:00 ET | 5.6 |
| Weekly roster trims | All positions (about 480,000 rows) or fantasy positions only (about 120,000) | Fantasy positions plus FB, about 12 columns | 2.1 |
| Player URL | GSIS ID or a name slug | GSIS ID; the name in the title | 5.2 |
| Injury designations | Show nflverse's Out/Doubtful/Questionable, or not | Not in the MVP | After the MVP |

**Assumptions:**
- nflverse keeps these field names and keys within nflreadpy 0.1.x (pinned by `uv.lock`).
- Neon Free, Vercel Hobby and GitHub Actions keep their terms, and the repository stays public.

## Phase overview

| Phase | Goal | Ends at | Estimate | Status |
| --- | --- | --- | --- | --- |
| 0 | Foundation: NFL data pipeline, dbt warehouse, team analysis, research site | — | (done) | Built, verified 2026-10-21 |
| 1 | Baseline and reliability: CI, error states, caching, nightly refresh | — | 14–24 h | Not started |
| 2 | Player data in `raw` | Gate A (internal) | 8–16 h | Not started |
| 3 | Fantasy transformations in dbt | — | 14–24 h | Not started |
| 4 | Fantasy analysis | Gate B (internal) | 7–13 h | Not started |
| 5 | The fantasy site and weekly reliability | **Gate C: Research Beta**, then **Gate D: Reliable Weekly Application** | 22–40 h | Not started |
| 6 | Projections and evaluation | **Gate E: Predictive MVP (v1.0)** | 20–38 h | Not started |
| 7 | Release and portfolio | **Gate F: Portfolio-ready Release** | 7–12 h | Not started |

**Dependencies:**
- Each phase needs the one before it, and the steps inside a phase run in order.
- In Phase 5, the Research move and nav switch (5.6) come only after 5.1–5.5 pass.
- Phase 6's live stages need 5.8's fail-safe publishing.
- Gates C and D don't depend on projections, so the beta can go live in season while Phase 6 is built.

## Release milestones

A gate is passed when every item on its list has been checked and recorded in `docs/decisions.md` with its evidence: command output, screenshots or SQL results. Each list can be checked on its own.

**Gate A: data first (internal, after Phase 2)**
- [ ] `docs/fantasy-source-audit.md` is complete, and notebook 07 re-runs with its asserts passing.
- [ ] Player stats, players, weekly rosters and snap counts (2016+) are loaded locally and on Neon. Every player data check passes and fails when broken on purpose.
- [ ] Snap counts pass the mapping gate: at least 99.5% of skill-position appearances map to a GSIS ID, in every season.
- [ ] Neon storage is measured and under 700 MB.

**Gate B: coherent analysis (internal, after Phase 4)**
- [ ] Scoring fixtures and the nflverse agreement test pass in the production dbt build.
- [ ] Participation tests pass: one state per player-week, and no non-played state carries points.
- [ ] `docs/fantasy-findings.md` reports the baselines on the development and validation seasons, with n.
- [ ] The opportunity label rule is either defined from evidence or explicitly dropped.

**Gate C: Research Beta (public, after step 5.7)**
- [ ] `/this-week`, `/players`, `/players/[playerId]`, `/opportunity`, `/compare` and `/methodology` return 200 in production. Every research URL (`/teams`, `/teams/[team]`, `/explorer`, `/leaderboards`, query strings included) returns 308 to its `/research/...` page.
- [ ] `web/scripts/smoke.mjs` passes against production.
- [ ] A recorded walkthrough on the live site covers:
  - US-01 (week → team players);
  - US-02 (search and filter, stable URLs);
  - US-03 (game log);
  - US-04 (three formats);
  - US-05 (opportunity);
  - US-07 (compare, without projections);
  - US-08 (freshness);
  - US-09 (scoring and data methodology).
- [ ] Any supported player is reachable from the home page in three interactions or fewer.
- [ ] A production SQL check finds 0 player-weeks in a state other than played or special-teams-only that are displayed with points. Did-not-play, bye, scheduled, pending and cancelled never show 0.
- [ ] No projected number appears anywhere; pages say "Projections coming later".
- [ ] The footer and methodology credit nflverse (CC BY 4.0), Pro Football Reference (snap counts) and Open-Meteo (CC BY 4.0). There are no logos or player photos.
- [ ] No horizontal scrolling at 320 px on any new page.

**Gate D: Reliable Weekly Application (after step 5.10)**
- [ ] The nightly job ran green on schedule, unattended, through a full NFL week (Thursday night to Monday night), and the freshness stamp advanced each day without a redeploy.
- [ ] Simulated critical failure (a broken critical test): the run is red, the site isn't refreshed, it keeps serving the previous data, and a stale notice appears after the threshold.
- [ ] Simulated snap-count delay: stats and points still update, the affected games read "snap counts pending", and the next good run clears both.
- [ ] A manual rerun of a successful night changes no row counts.
- [ ] CI turns a pull request with a failing test red.
- [ ] Rob has followed `docs/operations.md` once to rerun a failed job.

**Gate E: Predictive MVP, v1.0 (after Phase 6)**
- [ ] `docs/fantasy-evaluation.md` reports, per position and scoring format:
  - MAE and mean bias against the naive baselines, with n;
  - on validation 2024 and on the once-opened test season 2025;
  - interval coverage wherever a range is shown.
- [ ] The leakage suite (truncation, corrupted future rows, availability lags, `as_of` before kickoff) is green in CI.
- [ ] A full live NFL week is archived:
  - every graded forecast has `as_of` before its game's actual kickoff and stored inputs;
  - every one was graded with no manual steps.
- [ ] 0 archive rows were updated or deleted. The trigger is in place, and a count-and-hash check matches the weekly export.
- [ ] `/performance` reads only from marts. Projections on the player, compare and this-week pages show model version, generated time and a range (or "range not yet validated").
- [ ] A review of every page's text finds no accuracy or edge claim beyond the measured results.

**Gate F: Portfolio-ready Release (after Phase 7)**
- [ ] The README plus `docs/fantasy-methodology.md`, `docs/fantasy-evaluation.md`, `docs/agent-workflow.md` and `docs/operations.md` are complete and linked.
- [ ] A fresh clone, following only the README, runs the tests and reproduces the 6.7 evaluation numbers locally, with no private credentials.
- [ ] The licence and attribution review and the production security review are recorded with their outputs.
- [ ] The site is live at its portfolio subdomain, and the case study is published.

## Phase 0 — Foundation (built)

The project's NFL data engineering, analytics and team research infrastructure. Everything in this phase exists and works. None of it is fantasy functionality, which starts in Phase 2.

**Verified on 2026-10-21:**
- one commit per step;
- the live routes render;
- 110 web tests and 39 Python tests pass;
- 316 dbt tests passed at the last build.

Each step's choices and evidence are in `docs/decisions.md`.

**What it provides:**
- **Pipeline:** `uv run python -m pipeline ingest`, which loads schedules (1999+), teams, weather (2000+) and play-by-play (2016+) with idempotent, season-scoped upserts (`pipeline/db.py`).
- **Warehouse:** a dbt project with staging models, the `games`, `team_games`, `team_game_stats` and `team_seasons` marts, `dim_teams`, `dim_stadiums`, the situation registry and split marts, and 316 tests.
- **Analysis:** a pre-registered statistical analysis of team situations (notebooks 02–06, `docs/findings.md`) with the reusable `pipeline/analysis.py`.
- **Website:** a Next.js site with a design system, read by the least-privilege `web_reader`. Its team research pages are team pages, the situation explorer, leaderboards and a situational This week.

**Role in the application:**
- **core:** used directly by the player features;
- **research:** the team research section.

**Setup and walking skeleton.** All core.
- [x] 0.1 Install the tools
- [x] 0.2 Repo and `CLAUDE.md`
- [x] 0.3 Postgres in Docker
- [x] 0.4 Python environment
- [x] 0.5 First load
- [x] 0.6 Next.js app
- [x] 0.7 Read the table from Next.js
- [x] 0.8 Neon
- [x] 0.9 Vercel
- [x] 0.10 Read-only `web_reader`

**Ingestion.** All core.
- [x] 0.11 Raw-layer conventions
- [x] 0.12 Schedules 1999+ with upserts
- [x] 0.13 Idempotency
- [x] 0.14 Teams
- [x] 0.15 Stadiums seed
- [x] 0.16 Weather (context)
- [x] 0.17 Play-by-play 2016+
- [x] 0.18 One command
- [x] 0.19 Data checks
- [x] 0.20 Production load

**Warehouse (dbt).**
- [x] 0.21 Long format
- [x] 0.22 dbt setup
- [x] 0.23 Seeds and sources
- [x] 0.24 Staging models
- [x] 0.25 `games`
- [x] 0.26 `team_games`
- [x] 0.27 Travel and body clock
- [x] 0.28 `team_game_stats`
- [x] 0.29 Form features
- [x] 0.30 Situation registry
- [x] 0.31 Split marts
- [x] 0.32 Tests and docs
- [x] 0.33 Production build

Role:
- **core:** the staging models, `games`, `team_games`, `team_game_stats`, `team_seasons`, `current_team()` and the test style;
- **research:** the registry and the split marts.

**Team situation analysis.**
- [x] 0.34 Notebook setup
- [x] 0.35 Sanity checks
- [x] 0.36 League-wide situation effects
- [x] 0.37 The big questions
- [x] 0.38 Small samples and noise
- [x] 0.39 Findings

Role:
- **core:** `pipeline/analysis.py` and the pre-registration habit;
- **research:** the notebooks and `findings.md`.

**Research site.**
- [x] 0.40 Data access layer (core)
- [x] 0.41 App shell and design tokens (core)
- [x] 0.42 Teams index (research)
- [x] 0.43 Team page record (research)
- [x] 0.44 Splits table (research)
- [x] 0.45 Split charts (research)
- [x] 0.46 Situation explorer (research)
- [x] 0.47 Leaderboards (research)
- [x] 0.48 This week, situational (research; becomes `/research/this-week` in 5.6)

**Not built yet:** error and loading states, and caching. These are steps 1.4 and 1.5.

## Phase 1 — Baseline and reliability

**Goal:** before any player code, measure what works, set a restore point, and close the site's reliability gaps:
- no CI;
- a soft 404;
- no caching;
- no automation, so production is already stale.

The site is then safe to change and stays fresh while the player features are built.

**Detailed plan:** `docs/plans/phase-1.md`, agreed with Rob on 2026-10-21. It sets out each step's tasks, files, tests, safeguards and approvals; `docs/decisions.md` still wins where they disagree.

- [x] **1.1 Baseline checks.**
  - With Docker running:
    - `uv run pytest` (all, including the local-only upsert tests);
    - a local `uv run python -m pipeline dbt build`;
    - in `web/`: `npm ci`, `npm run lint`, `npm test`, `npx tsc --noEmit` and `npm run build`.
  - Record each result in a dated baseline entry in `docs/decisions.md`.
  - A failure gets its own fix step before 1.2 if it blocks later work, or a parking-lot entry if it doesn't. Unrelated code is never repaired silently.
  - Learn: why you measure before you change anything.
  - Done when: every check has a recorded result, and every failure has a recorded decision.
- [x] **1.2 Restore points.**
  - **Restore points:**
    - A git tag `foundation` on the commit 1.1 measured, pushed with Rob's approval.
    - Rob creates a Neon branch `foundation`; Claude gives click-by-click steps.
    - A schema-only `pg_dump` of Neon, taken through the Postgres 18 container into a gitignored `backups/` folder.
  - Learn: restore points, additive changes, backout.
  - Done when:
    - the tag shows on GitHub (`git ls-remote --tags origin foundation`);
    - Rob confirms the Neon branch;
    - the dump file exists;
    - `create_web_reader.py --check` reports the same access as on 2026-10-19.
- [x] **1.3 Pull-request checks.**
  - `.github/workflows/ci.yml` runs on pull requests and pushes to `main`:
    - `ruff check` (ruff added to the dev group);
    - `pytest`: the pure tests, plus the local-only tests against a `postgres:18` service container; Neon data checks excluded;
    - `npm ci`, ESLint, `tsc --noEmit` and Vitest;
    - `dbt parse`.
  - No production secrets are needed. `next build` stays with Vercel, because after 1.5 it needs the database.
  - Learn: continuous integration, service containers, why CI never holds production credentials.
  - Done when: `main` is green, and a pull request with a type error and one with a failing pytest both turn red. Rob may also make the check required in the branch settings.
- [x] **1.4 States and polish.** Built to the agreed design in `docs/plans/states-and-caching.md`. The player pages reuse these patterns.
  - A real 404 on unknown team codes (live `/teams/xyz` returns 200 today), checked in Proxy before the page renders (a page's own check couldn't set the status: `docs/decisions.md`, 2026-10-22).
  - Error boundaries; empty states; skeleton loading; page titles and descriptions.
  - The small-sample rule; touch-friendly hints.
  - Learn: why the status code is fixed by the first streamed bytes, and what Proxy can do that a page can't.
  - Done when (from the agreed plan):
    - `curl` returns 404 for `/teams/xyz`, 200 for `/teams/buf` and 308 for `/teams/BUF`, both locally and live;
    - each empty and error state is shown once;
    - every route's title and description are in its HTML head;
    - tests, lint and build pass.
- [ ] **1.5 Caching and the refresh route.** Built to the agreed design in `docs/plans/states-and-caching.md`:
  - `'use cache'` with `cacheLife('marts')` and `cacheTag('marts')` on every query, a tag every later query also uses;
  - static shells;
  - `POST /api/revalidate` with a Bearer secret compared in constant time. Rob adds `REVALIDATE_SECRET` in Vercel.
  - Learn: static vs streamed rendering; revalidation by tag.
  - Done when (from the agreed plan):
    - the route table shows the expected static and partial routes;
    - repeat visits are measurably faster, locally and live;
    - the route returns 401, 405 and 503 for the wrong secret, GET and a missing secret;
    - a POST refreshes a changed value.
- [ ] **1.6 Nightly refresh and run records.**
  - **Run records.** `pipeline/runs.py` writes:
    - `raw.pipeline_runs`: run ID, trigger, start and finish, status, git SHA;
    - `raw.source_loads`: run ID, table, seasons, status, rows inserted, updated and deleted, a sanitized error, nflreadpy version.
  - **Loaders run independently.** The CLI loads each source on its own. A failure is recorded and the others continue; the run exits non-zero at the end. dbt is skipped only if a required source (schedules) failed.
  - **Freshness.** The mart `marts.data_freshness` gives each source's last successful load and rows. The footer shows "Data updated …" from it, through a cached query.
  - **The workflow.** `.github/workflows/nightly.yml`:
    - runs on `workflow_dispatch` and a daily cron at 09:30 UTC, after nflverse's overnight builds;
    - uses a concurrency group, so two runs never overlap;
    - restores the Open-Meteo cache from the Actions cache;
    - runs ingest against Neon, then `dbt build`, then POSTs to the refresh route, then requests the main pages.
  - **Secrets.** Rob adds `NEON_DATABASE_URL`, `REVALIDATE_SECRET` and `SITE_URL` as repository secrets, with click-by-click steps.
  - Learn: YAML, runners, secrets, cron in UTC, why a rerun is safe.
  - Done when:
    - a manual run is green, and a scheduled run fires on its own;
    - the footer stamp advances without a redeploy;
    - a deliberately broken dbt test turns the run red and skips the refresh;
    - a forced failure of one loader (weather) is recorded in `raw.source_loads` while the other tables still load.

Checkpoint: you can explain:
- what was preserved and why;
- the difference between CI and the nightly job;
- how to roll a change back;
- what happens, step by step, during a nightly run.

## Phase 2 — Player data (the raw layer)

**Goal:** every player source the MVP needs is loaded into `raw` (2016 on), checked, repeatable with one command, and refreshed nightly.

- [ ] **2.1 Source audit and column choice.**
  - **Notebook 07** (`notebooks/07_player_sources.ipynb`) re-runs headless and checks, for each source:
    - schema and row counts per season;
    - key uniqueness and ID mapping rates;
    - team-code conventions;
    - current-season coverage;
    - the scoring identity.
  - **Choices it makes:**
    - about 45 of the 150 player-stats columns;
    - the weekly-roster trims;
    - the projected storage.
  - **`docs/fantasy-source-audit.md`** has the requirements' §5.2 table per source:
    - the function and the pinned nflreadpy version;
    - seasons and row counts;
    - fields, types and keys;
    - last update and current-season coverage;
    - coverage rates and anomalies;
    - the licence;
    - whether it is required, optional or not feasible.

    It also states which metrics use weekly stats and which use play-by-play (play-by-play is not reloaded; see [Data sources](#data-sources-verified-2026-10-21)).
  - Learn: checking a source's coverage before depending on it.
  - Done when:
    - the notebook's asserts pass: 0 duplicate keys; the scoring identity with 0 mismatches; snap mapping of at least 99.5% in every season from 2016;
    - the document is complete;
    - projected Neon storage is under 700 MB.
- [ ] **2.2 Harden the upsert.**
  - **`upsert_dataframe` refuses bad input before writing anything:**
    - duplicate key values;
    - null key values;
    - a scope column without scope values.

    Each refusal reports the count and the first examples.
  - **Explicit column types.** Column types come from an explicit map rather than the first season loaded. `compact()` moves from `load_pbp.py` into `db.py`.
  - **Collection fix.** `test_upsert.py` no longer fails at import when `DATABASE_URL` is unset.
  - Learn: guarding a write path; why a crash mid-statement is worse than a clear refusal.
  - Done when: the new `test_upsert.py` cases pass, each fails when its guard is removed, and the existing loaders' reruns still change nothing.
- [ ] **2.3 Weekly player stats.**
  - `pipeline/load_player_stats.py` loads `raw.player_stats_weekly`:
    - key `(player_id, game_id)`, scoped by season, 2016+, run with `--only player_stats`;
    - the chosen columns, compacted to integers.
  - **It keeps every player with an ID**, not only skill positions, because team totals need everyone's targets and carries.
  - nflverse's placeholder "Team" rows have no player ID. They are dropped and counted in the log.
  - Learn: grain and keys; why a share's denominator needs every player.
  - Done when:
    - each season's rows equal the source minus the placeholders;
    - a second run changes nothing;
    - a hand-edited row is restored;
    - there are 0 duplicate keys.
- [ ] **2.4 Players and weekly rosters.**
  - `pipeline/load_players.py` loads `raw.players`: key `gsis_id`, upsert-only like teams. It holds names, positions and the `pfr_id` used to map snap counts.
  - `pipeline/load_rosters.py` loads `raw.rosters_weekly`: key `(season, week, gsis_id, team)`, scoped by season, 2016+, with the trims from 2.1. Rows without a GSIS ID are dropped and logged.
  - Done when:
    - every `player_id` in `raw.player_stats_weekly` exists in `raw.players` (any exceptions are listed by name);
    - players traded mid-week appear once per team;
    - a second run changes nothing.
- [ ] **2.5 Snap counts.**
  - `pipeline/load_snap_counts.py` loads `raw.snap_counts`: key `(game_id, pfr_player_id)`, scoped by season, 2016+.
  - **Late-tolerant.** A finished week with no snaps yet is recorded in `raw.source_loads` as "not yet published", not as a failure.
  - **Mapping gate.** At least 99.5% of each season's regular-season skill-position offensive appearances must map to a GSIS ID through `raw.players.pfr_id` (99.80–100% measured on 2026-10-21).

    If the gate fails, stop and report: played vs did-not-play can't be built without it.
  - Learn: ID crosswalks; joining sources that use different keys.
  - Done when:
    - the gate passes in every season;
    - a rerun changes nothing;
    - a simulated missing week still loads player stats and records the snaps as pending.
- [ ] **2.6 Player data checks.**
  - `pipeline/tests/test_raw_data.py` gains player checks, with commented SQL checks in `pipeline/sql/checks/`:
    - duplicate keys;
    - every player-stats `game_id` exists in schedules;
    - team and opponent match the schedule after the relocation map;
    - ID mapping coverage;
    - season types;
    - current-season freshness: each source's latest finished week is present within its publication lag.
  - **The two residual team mismatches** found on 2026-10-21 are explained. Any data correction is a judgment call for Rob, with counts.
  - Learn: data-quality tests as a safety net for every later step.
  - Done when: the checks pass, and each fails when broken on purpose (a duplicate row, an orphan game, a wrong team).
- [ ] **2.7 Load production and extend the nightly job.**
  - With Rob's approval:
    - a full load of the player tables on Neon (`DATABASE_URL` set to Neon for that one command);
    - the player checks against Neon;
    - the player tables added to the nightly job's default list.
  - Measured storage is recorded in `decisions.md`.
  - Done when:
    - the Neon checks pass;
    - storage is measured and recorded;
    - the next nightly run loads the player tables and records each in `raw.source_loads`.

**Gate A** (see [Release milestones](#release-milestones)).

Checkpoint: you can explain:
- why GSIS IDs and never names;
- why the load is idempotent;
- how coverage was checked;
- why snap counts became required.

## Phase 3 — Fantasy transformations with dbt

**Goal:** one tested row per player per game, with fantasy points in all three formats, an explicit participation state for every player-week, opportunity windows, and pregame features that can't see the future.

- [ ] **3.1 Player staging models.**
  - Four staging models: `stg_player_stats_weekly`, `stg_players`, `stg_rosters_weekly` and `stg_snap_counts`.
  - **Team codes:** every source's team codes pass through `current_team()`. Player stats use today's codes; snap counts and schedules use the listed ones.
  - **IDs:** snap counts gain their GSIS ID through `stg_players`.
  - **Positions:** `fantasy_position` maps players to QB, RB (fullbacks included, if Rob confirms), WR and TE.
  - **Tests:**
    - `unique` and `not_null` on keys;
    - `accepted_values` on positions and season types;
    - `relationships` from team codes to `stg_teams` and from `game_id` to `stg_schedules`.
  - Learn: why the staging layer standardises codes and IDs once.
  - Done when: `dbt build` passes, and a planted unknown team code fails the relationships test.
- [ ] **3.2 Canonical fantasy scoring.**
  - **Seeds:**
    - `scoring_rules.csv`: one row per stat column, with its Standard, Half-PPR and PPR points. It loads into `marts`, so the methodology page reads the real rules.
    - `scoring_fixtures.csv`: hand-computed stat lines with their expected points in each format. The cases:
      - a dual-threat QB;
      - a WR with 8 receptions;
      - an RB with rushing and receiving TDs;
      - a passing two-point conversion;
      - a fumble lost counted once;
      - negative yards;
      - a special-teams TD;
      - played with zero stats;
      - fractional PPR.
  - **The macro.** `fantasy_points()` builds the SQL expression from the rules seed when dbt compiles, the same pattern as `situation_registry()`.
  - **Singular tests:**
    - fixtures equal their expected points;
    - points equal nflverse's `fantasy_points` and `fantasy_points_ppr` (0 mismatches in 188,522 player-games on 2026-10-21);
    - Half-PPR = (Standard + PPR) / 2.
  - **Rob decides first, with the counts in [Open decisions](#open-decisions):**
    - player special-teams TDs (recommended: +6, as nflverse);
    - fumbles lost on returns (recommended: not counted, as nflverse).
  - Learn: one definition with many consumers; fixtures; why a source's own column is a check, not the implementation.
  - Done when: every scoring test passes, and each fails when one rule value is changed.
- [ ] **3.3 Team usage and player games.**
  - **`fct_team_game_usage`:** one row per `(game_id, team)`.
    - Team targets, carries, pass attempts and air yards, summed over every player.
    - Team offensive snaps, from snap counts: a full-snap player's snaps ÷ share.
  - **`fct_player_games`:** one row per `(game_id, player_id)` for QB/RB/WR/TE.
    - It is built from stats rows plus snap-count appearances, so players who played and recorded nothing are included.
    - Participation is `played` (offensive snaps or an offensive stat) or `special_teams_only`.
    - Stats are zero-filled only for those rows.
    - Points in three formats come from the macro.
    - Team, opponent, season, week, `season_type` and kickoff come from `team_games`.
    - Flags: `has_stats_row`, `snap_status` (present or pending), `data_complete`.
  - **Rob decides, with counts:** whether `special_teams_only` games count in per-game averages (recommended: no; reported separately).
  - Learn: grain; building a fact from two sources; zero vs null.
  - Done when:
    - `(game_id, player_id)` is unique;
    - target and carry shares match nflverse's `target_share` to four decimals where it exists;
    - no team-game's player targets exceed its team total;
    - the zero-stat appearances are present with 0 points (8,381 regular-season ones since 2016 on 2026-10-21);
    - five sampled player-games match an independent published box score.
- [ ] **3.4 Players and the weekly participation spine.**
  - **`dim_players`:** one row per player with a regular-season game since 2016 or on a current roster.
    - Display name and fantasy position.
    - Current team, with `team_source` (roster week or last game) and `team_as_of`.
    - First and last season.
  - **`mart_player_weekly`:** one row per player per regular-season week while on a team (from `rosters_weekly`), with exactly one participation state:
    - `played`;
    - `special_teams_only`;
    - `did_not_play`: the team played, the player didn't;
    - `bye`: the team had no game;
    - `scheduled`: the game is still to come;
    - `pending`: finished, but no stats row and the snaps aren't published yet;
    - `cancelled`: from the `cancelled_games` seed, e.g. 2022 week 17 BUF–CIN, which nflverse omits.
  - It links the `game_id`. Points are filled only for `played` and `special_teams_only`.
  - Learn: modelling absence explicitly; why null and zero mean different things.
  - Done when:
    - every row has exactly one state;
    - one real fixture player per state is pinned in a singular test;
    - bye weeks equal the team's schedule;
    - no row outside `played` and `special_teams_only` carries points;
    - every regular-season row of `fct_player_games` appears once.
- [ ] **3.5 Opportunity windows.**
  - `mart_player_opportunity` has one row per player per completed regular-season week. It stores **sums and counts only**, never averages (the project convention), for three windows:
    - the last 3 played games;
    - the last 5 played games;
    - season-to-date.
  - **What it sums:**
    - targets, carries and pass attempts;
    - team targets, carries and attempts from the **same games**;
    - offensive snaps and team snaps where published;
    - points in each format;
    - games.
  - **Windows count `played` games only.** Did-not-play, bye, scheduled and cancelled weeks are skipped. A `pending` game is left out, and the window is flagged `window_incomplete`.
  - Learn: window functions with `ROWS BETWEEN … PRECEDING`; why the denominator must come from the same games.
  - Done when:
    - one WR and one RB are reconciled by hand over several weeks (`pipeline/sql/checks/opportunity_example.sql`);
    - players with 0, 1 and 2 played games are handled;
    - no division happens inside the mart.
- [ ] **3.6 Pregame features with point-in-time rules.**
  - **The `source_availability.csv` seed** gives each source's publication lag after kickoff (player stats overnight, snap counts about 1–2 days) and the days until stat corrections settle.
  - **`mart_player_pregame_features`** has one row per (player, target game), for regular-season games from 2017 and for upcoming games, with an `as_of`:
    - backtests: 24 hours before the target week's first kickoff;
    - live: the run time.
  - **What a feature can use.** Only observations from earlier weeks, whose kickoff + source lag ≤ `as_of`, plus prior-season carryover for early weeks.
  - **Eligibility** uses the previous week's roster.
  - **No feature may use:**
    - the target week's roster status (game-day inactives are only known about 90 minutes before kickoff);
    - lines;
    - weather;
    - injuries;
    - anything from the target game.
  - Null and unknown flags are explicit. The mart stores sums and counts.
  - **Leakage tests:**
    - a dbt singular test that every row's newest contributing observation + its lag ≤ `as_of`;
    - a local-only pytest **truncation test**: features built from all data equal features built after deleting every later week, in a throwaway schema;
    - a **corrupted-future test**: scrambling every stat from the target week on leaves earlier features unchanged.
  - Learn: data leakage; point-in-time correctness; why the final, corrected data isn't what you knew at the time.
  - Done when: all three tests pass, and each fails when the lag rule is removed on purpose.
- [ ] **3.7 Indexes, documentation and the production build.**
  - **Indexes:** dbt `indexes` on the player marts (`player_id`; `(season, week)`; position and team).
  - **Query plans:** `EXPLAIN ANALYZE` for player search, a player's history and a week view.
  - **Documentation:** every new model and column described (shared columns through docs blocks), and `docs/data-model.md` updated.
  - **Production:** a Neon build with Rob's approval, then `npm run db:pull`.
  - Done when:
    - each sample query takes under 100 ms on Neon;
    - `dbt build` passes on Neon;
    - measured storage is recorded.

Checkpoint: you can explain:
- player-game grain;
- team-share denominators;
- the participation states and zero vs null;
- lagged windows;
- point-in-time features;
- how dbt tests guard each one.

## Phase 4 — Fantasy analysis

**Goal:** find out, on seasons set aside in advance, which simple signals predict next week's opportunity and points, before any page claims they do. The analysis also produces the write-up for the portfolio.

- [ ] **4.1 Analysis rules, set before any estimate.**
  - A `docs/decisions.md` entry, pushed before 4.2 computes anything:
    - **Seasons:** development 2017–2023 (2016 as history only), validation 2024, test 2025 sealed until 6.7, live 2026.
    - **Cohort:** regular season, QB/RB/WR/TE, played games. Did-not-play rates are reported separately.
    - **Metrics:** MAE and mean bias per position and format.
    - **Uncertainty:** a paired bootstrap that resamples players (all their games together), with the fixed `SEED`.
    - **The rule for any opportunity label.**
  - Learn: pre-registration; why the test season stays sealed.
  - Done when: the entry is pushed before any estimate.
- [ ] **4.2 Production sanity check.** Notebook 08 covers:
  - points by position and season against nflverse;
  - outliers;
  - participation counts by state;
  - played-with-zero vs did-not-play;
  - three games checked against published box scores.

  Discrepancies are logged in `docs/fantasy-findings.md`.
  - Done when: the notebook re-runs headless with its asserts passing, and the discrepancy log exists, even if empty.
- [ ] **4.3 Opportunity signal.**
  - Notebook 09, on the development seasons only, asks: do the last 3 or 5 games' target and carry shares (or volumes) predict next-game opportunity and points better than season-to-date?
  - It reports n, confidence intervals, subgroup limits and negative findings.
  - A deterministic "Usage rising" rule is defined only if the evidence supports it.
  - Learn: past-to-future comparisons; regression to the mean in player usage.
  - Done when: there are charts and one written conclusion, and the label rule is either defined or dropped with its reason.
- [ ] **4.4 Baselines.**
  - **Notebook 10 compares five baselines** per position and format:
    - season-to-date points per played game;
    - the last 3 played games;
    - the last 5 played games;
    - a blend with the prior season for early weeks;
    - the position mean as a fallback.
  - **Seasons:** development first; then validation 2024 chooses the fallback order. The test season is untouched.
  - Learn: naive baselines as the bar every model must clear.
  - Done when: a table shows MAE, bias and n for each baseline × position × format, and the fallback order was chosen on validation.
- [ ] **4.5 Write up the findings.** `docs/fantasy-findings.md` covers:
  - what was measured, negative results included;
  - what remains unproven;
  - what the site will and won't claim.
  - Done when: the conclusions are measured results with their n, not just charts.

**Gate B** (see [Release milestones](#release-milestones)).

Checkpoint: you can present one finding as question, method, result and caveat, including a negative one.

## Phase 5 — The fantasy site and weekly reliability

**Goal:** the fantasy views, reading only from the marts, with real states for missing data; then a nightly job that never publishes wrong data. The team pages move to a Research area only after the new pages pass their checks.

### The fantasy site (5.1–5.7)

- [ ] **5.1 Query modules and the players index.**
  - **The split.** `web/lib/queries.ts` becomes `web/lib/queries/`: `teams.ts`, `situations.ts`, `games.ts`, `players.ts` and `freshness.ts`.
    - It is a pure move; the tests are unchanged.
    - `CLAUDE.md` is updated to match.
  - **`/players`:**
    - name search (a bound `ILIKE`);
    - position, team and season filters;
    - sorting by recent points, targets or carries, and season points;
    - server-side pagination;
    - state in the URL;
    - unknown parameters rejected, as in the explorer;
    - skeleton, empty and stale states.
  - Learn: splitting a module without changing behaviour; server-side pagination.
  - Done when:
    - results equal a SQL check for three filter combinations;
    - unknown parameters are rejected;
    - there is no horizontal scroll at 320 px.
- [ ] **5.2 Player profile.** `/players/[playerId]`:
  - **The ID:** a GSIS ID validated before streaming, so an unknown one gives a real 404.
  - **Controls:** a scoring selector (`?scoring=std|half|ppr`, default decided here; recommended Half-PPR) and a season selector.
  - **Weekly points:** a chart and table where every participation state is labelled. Did-not-play, bye, pending and scheduled never show 0.
  - **Comparisons:** last 3, last 5 and season-to-date, with played games as the denominator.
  - **Opportunity:** target share, carry share and snap share ("pending" when snaps aren't published).
  - **Also:** next opponent; a neutral avatar (no photos); "Projections coming later"; page metadata.
  - Done when:
    - two players' pages (one WR and one RB, between them showing a did-not-play week and a bye) match SQL checks at desktop and 375 px widths;
    - `/players/00-0000000` returns 404.
- [ ] **5.3 Opportunity Tracker.** `/opportunity` has:
  - **Filters:** position, window (3 or 5 played games), week, team and a minimum volume.
  - **Each row:** the raw counts and the change against season-to-date, the games behind each figure, and an "incomplete window" mark.
  - **A label** appears only if 4.3 defined one, and the methodology explains it.
  - Done when: sorting and filtering equal a SQL check, and players below the minimum sample are labelled, not ranked.
- [ ] **5.4 Compare.** `/compare?a=…&b=…`:
  - **For both players:** the same scoring and week; recent points, opportunity, upcoming opponent and roster status.
  - **Edge cases handled:** the same player twice, a bye, an unsupported position, an unknown ID.
  - **No advantage score.** Projections join in 6.9.
  - Done when: each edge case shows its message, and a unit test of the parser shows both columns always use the same parameters.
- [ ] **5.5 Methodology.** `/methodology` covers:
  - the scoring table, rendered from `marts.scoring_rules`;
  - definitions: participation states, shares, windows, minimum samples;
  - data sources with their licences and update times;
  - limitations;
  - a projections section that 6.9 fills.
  - Done when: the scoring table on the page equals the seed (nothing typed by hand), and every term used on the other pages links to its definition.
- [ ] **5.6 Fantasy This Week and the navigation switch.**
  - **`/this-week` becomes the fantasy view:**
    - the current season and week chosen by date (the rollover rule is decided here; recommended Tuesday 12:00 ET);
    - game cards with kickoff in ET (stored in UTC) and links to each team's players;
    - the freshness and coverage banner, e.g. "Snap counts through week 6; week 7 pending";
    - an offseason fallback showing the last completed week and player research.
  - **The situational This week moves** to `/research/this-week`.
  - **The team pages move under `/research`.** `/teams`, `/teams/[team]`, `/explorer` and `/leaderboards` do, with 308 redirects that keep query strings.
  - **Navigation:**
    - This Week, Players, Opportunity, Compare and Methodology, with Research secondary;
    - `/` presents This Week.
  - **Site copy and the footer change:**
    - the footer credits nflverse (CC BY 4.0), Pro Football Reference (snap counts, via nflverse) and Open-Meteo (CC BY 4.0);
    - "Not affiliated with the NFL" stays.
  - Learn: permanent redirects; changing navigation without breaking inbound links.
  - Done when:
    - a curl list of every research URL, with query strings, returns 308 to the right new URL;
    - home → search → player takes three interactions or fewer;
    - a unit test with a forced date shows the offseason fallback.
- [ ] **5.7 Smoke and accessibility checks.**
  - **`web/scripts/smoke.mjs`** requests every route, including the 404 and redirect cases, and checks the status and a key text. It runs against `next start` and production; the nightly job runs it after each refresh.
  - **A manual pass at 320, 375, 768 and 1,280 px:**
    - keyboard-only navigation;
    - labels;
    - tables as the text alternative to charts.

    Screenshots are taken with headless Chrome and kept out of the repo.
  - Done when: the smoke script passes locally and live, and the checklist is recorded in `decisions.md`.

**Gate C: Research Beta** (see [Release milestones](#release-milestones)). The site is publicly usable from here, with "Projections coming later".

Checkpoint: you can trace any number on a fantasy page back through its query, mart, staging model and raw table to the nflverse source.

### Weekly reliability (5.8–5.10)

**Goal:** the nightly job from 1.6, made safe. A failed or late source never puts wrong data on the site, never blocks the data that did arrive, and is always visible to the reader.

- [ ] **5.8 Fail-safe publishing.**
  - **Critical tests.** Critical integrity tests carry a dbt `critical` tag and sit at staging, so a failure skips the marts and the site keeps the previous tables. They cover:
    - keys;
    - schedule joins;
    - the scoring fixtures;
    - the participation rules.
  - **When the site refreshes.** The workflow reads dbt's run results. It refreshes only when no critical test failed. A non-critical failure still publishes and is recorded.
  - **Visible staleness:**
    - `dbt source freshness` thresholds per source;
    - a site-wide stale notice when the last successful run is more than 36 hours old in season.
  - Learn: failing safe; why dbt builds a table before testing it, and how the tags work around that.
  - Done when:
    - a simulated critical failure leaves the site serving the previous data, records the failure and shows the stale notice after the threshold;
    - the next good run clears it.
- [ ] **5.9 Late and failing sources.**
  - **Delayed snap counts** (Pro Football Reference publishes on its own schedule). Stats and points still publish. The affected games read `pending`, and the pages say which week the snaps run through, from `data_freshness`.
  - **A failing optional source** (weather) blocks neither the other loaders nor dbt.
  - Learn: graceful degradation; telling the reader what's incomplete.
  - Done when:
    - a simulated snap delay (the snap load skipped) shows stats updated and pending labels;
    - a simulated weather failure doesn't stop player data;
    - both are recorded in `raw.source_loads`.
- [ ] **5.10 Operations runbook.** `docs/operations.md` covers:
  - the schedule in UTC and ET;
  - how to rerun and recover;
  - rotating secrets;
  - the preseason re-enable (GitHub turns off schedules after 60 days without activity);
  - the Open-Meteo cache;
  - the forecast archive's backups (from 6.8);
  - where to look when something fails.
  - Done when: Rob follows it once to rerun a failed nightly job (walkthrough).

**Gate D: Reliable Weekly Application** (see [Release milestones](#release-milestones)).

Checkpoint: you can explain what runs each night, what fails safely, what the reader sees when a source is late, and how to recover.

## Phase 6 — Projections and evaluation

**Goal:** an honest projection of each eligible player's next game in all three formats:
- stored before kickoff and never changed;
- graded afterwards;
- evaluated on seasons it never saw, against simple baselines;
- shown with its uncertainty, or an explicit "not available".

- [ ] **6.1 Forecast rules, set before any model.** A `docs/decisions.md` entry, pushed before 6.3 runs, sets:
  - **The target:** a regular-season player-game's points, built from two forecasts:
    - non-reception points (Standard);
    - receptions.

    PPR = Standard + receptions and Half-PPR = Standard + 0.5 × receptions, so the formats can never disagree.
  - **Eligibility:** QB/RB/WR/TE on the previous week's roster and not on reserve, with at least N played games (N from 4.4); otherwise the chosen fallback, or "unavailable".
  - **Inputs:** the `as_of` and lag rules from 3.6.
  - **Seasons:** the 4.1 splits.
  - **Metrics:** MAE, bias and interval coverage.
  - **Did-not-play games:** excluded from MAE and reported as a rate.
  - Learn: defining the target and the cohort before modelling.
  - Done when: the entry is pushed before any model runs.
- [ ] **6.2 The forecast archive.**
  - **The table.** `pipeline/sql/player_projections.sql` creates `raw.player_projections`, with:
    - IDs: `forecast_id`, `forecast_run_id`, `run_type` (backtest or live), `model_version`;
    - times: `as_of_utc`, `generated_at_utc`;
    - the target: `target_game_id`, season, week, and `target_kickoff_utc` as known at that time;
    - the forecast: `player_id`, projected Standard, Half-PPR and PPR points, projected receptions, and the interval bounds (or null);
    - provenance: `fallback_reason`, the `inputs` used (JSON) and `inputs_hash`.
  - **Rules:**
    - a CHECK that `as_of_utc < target_kickoff_utc`;
    - a trigger that refuses UPDATE and DELETE;
    - no foreign key to schedules, so a cancelled game's forecasts survive;
    - a new row only when the inputs' hash or the model version changed since that player-game's last forecast.
  - Learn: append-only logs; why forecasts are history that can't be rebuilt.
  - Done when (local-only tests):
    - UPDATE and DELETE are refused, and so is an `as_of` after kickoff;
    - a rerun with unchanged inputs adds no rows;
    - changed inputs add a row and keep the old one.
- [ ] **6.3 Walk-forward baselines and grading.**
  - **Backtests.** `pipeline/projections/` writes walk-forward backtests for 2017–2024 into the archive (`run_type = backtest`), each week using only what its `as_of` allows.
  - **`mart_projection_grades`** (dbt) grades the last forecast per player-game and model made before the game's **actual** kickoff. Earlier forecasts stay, for lead-time analysis.
  - **Statuses:**
    - `after_kickoff`: the game was moved earlier than forecast;
    - `void_cancelled` or `game_missing`: postponed out of the data, or cancelled;
    - `did_not_play`;
    - `provisional` for 10 days after the game (the stat-correction window), then `final`.
  - **Corrected stats** change grades, never forecasts. Grades store additive sums: absolute error, error, squared error and interval hits.
  - Learn: walk-forward validation; grading without rewriting history.
  - Done when: every eligible backtest player-game has exactly one graded forecast, and MAE by position and format equals notebook 10's.
- [ ] **6.4 An opportunity-aware model, only if it earns its place.**
  - A ridge regression per position (scikit-learn added), fitted walk-forward on prior-only features:
    - shares;
    - team volume;
    - efficiency;
    - snap share;
    - home or away;
    - the opponent's points allowed to the position, if it helps.
  - It is kept only if its validation-2024 MAE beats the best baseline for that position, with a paired-bootstrap confidence interval that excludes zero. Otherwise the baselines ship.
  - Learn: regularisation; why a model must beat a naive baseline on unseen data.
  - Done when: a table compares the model with the baselines per position and format, with confidence intervals, and the decision is logged.
- [ ] **6.5 The leakage suite in CI.**
  - Local-only pytest tests on a small fixture dataset, run in CI's Postgres service:
    - truncation;
    - corrupted future rows;
    - availability lags;
    - `as_of` before kickoff for every live row;
    - archive immutability;
    - stored backtest inputs equal the features recomputed at the same `as_of`.
  - Done when: the suite is green in CI, and each test fails when its rule is broken on purpose.
- [ ] **6.6 Uncertainty ranges.**
  - **The method.** Empirical 80% ranges come from validation residuals, per position. They are split by projection size only where each band has at least 200 games.
  - **When a range is shown.** Coverage is checked by cross-fitting on validation. Where it falls outside 75–85%, the page shows "range not yet validated" rather than a range.
  - Learn: empirical prediction intervals; calibration.
  - Done when: coverage is reported per position, and the rule for showing a range is written in the methodology.
- [ ] **6.7 Open the test season.**
  - The chosen method and the baselines run once on 2025.
  - **`docs/fantasy-evaluation.md`** records:
    - the splits, metrics and n;
    - the baselines;
    - negative findings;
    - the point-in-time limits: backtests use corrected final data, measured in 6.8.
  - No model change after this commit.
  - Learn: why a test set is used once.
  - Done when: the document has the 2025 table, and the history shows no model change after it.
- [ ] **6.8 Live forecasts and grading in the nightly job.**
  - **Nightly stages:**
    1. ingest;
    2. `dbt build`;
    3. forecast (reads the feature mart, appends to the archive);
    4. `dbt build` of `player_projections_current` and the grades;
    5. refresh;
    6. the smoke check.
  - **Forecasts follow schedule changes.** A forecast for a game whose kickoff moved is re-issued only if its inputs changed; the grade decides against the actual kickoff.
  - **Weekly backup.** A compressed export of the archive is kept as a workflow artifact, with a row-count and hash check.
  - **Revision drift.** Each week, the stored live inputs are compared with the features recomputed from corrected data, and the drift is reported.
  - Done when, over a full NFL week:
    - every played game's graded forecast has `as_of` before kickoff;
    - grades appear with no manual steps;
    - 0 archive rows changed;
    - the export exists.
- [ ] **6.9 Projections on the site.**
  - **Profile, compare and This Week** show:
    - projected points in the chosen format;
    - the range, or "range not yet validated";
    - model version and generated time;
    - the games used;
    - a deterministic evidence list from displayed data: recent volume, shares, efficiency and freshness.
  - **Which forecast is shown.** Only the latest forecast made before the current kickoff, and never a stale one.
  - **`/performance`** shows graded results by position and format, kept separate for backtest, test and live, each with its n and the baselines.
  - **The methodology** gains its projections section.
  - Done when:
    - the displayed numbers equal the mart values for three players (SQL check);
    - unit tests show that after-kickoff and stale forecasts are never shown as current;
    - `/performance` reads only from marts.

**Gate E: Predictive MVP, v1.0** (see [Release milestones](#release-milestones)).

Checkpoint: you can explain:
- what the model predicts and what it sees;
- why it can't use future data, and how that's tested;
- how forecasts are stored and graded;
- which baselines it beats or fails to beat.

## Phase 7 — Release and portfolio

**Goal:** an employer understands the project in five minutes, and a developer can reproduce it.

- [ ] **7.1 README.**
  - The architecture, with a diagram showing the foundation layers and the fantasy layers built on them.
  - The stack, and setup from a fresh clone.
  - Data sources and their licences.
  - The dbt lineage.
  - Reproducible commands.
  - Done when: a fresh clone that follows only the README runs the tests and reproduces 6.7's numbers locally.
- [ ] **7.2 Documentation set:**
  - `docs/fantasy-methodology.md`: scoring, denominators, opportunity, the projection method, ranges and caveats;
  - `docs/fantasy-evaluation.md`, final;
  - `docs/agent-workflow.md`: what was delegated to Claude Code, how it was verified, which decisions were Rob's, and examples of corrections.
  - Done when: each document exists and is linked from the README and the methodology page.
- [ ] **7.3 Licences and attribution.**
  - Every source's licence and credit appears in the footer, the methodology and the README.
  - No image is shown without established rights.
  - The npm audit entries in the parking lot are rechecked.
  - Done when: the checklist in `decisions.md` is fully ticked.
- [ ] **7.4 Production security and smoke review.** The checks:
  - `create_web_reader.py --check`: marts readable, writes refused;
  - a secrets scan of the repo history and the client bundle;
  - the refresh route's 401, 405 and 503;
  - logs free of connection strings;
  - the smoke script against production.
  - Done when: each check is recorded with its output.
- [ ] **7.5 Domain, case study and resume.**
  - A subdomain of the portfolio site.
  - A case study: why this product, how the architecture grew from the team-research foundation, which signal improved projections, which didn't, and what comes next.
  - Three resume bullets with numbers.
  - Done when: the site is live at the subdomain and the case study is published.

**Gate F: Portfolio-ready Release** (see [Release milestones](#release-milestones)).

Checkpoint: you can say which decisions were yours, which tasks were agent-assisted, and how every claim was verified.

## Requirements traceability

**User stories** (`docs/requirements.md` §1.4):

| User story | Steps |
| --- | --- |
| US-01 This week's games → players | 5.6 |
| US-02 Search and filter, stable URLs | 5.1, 5.2 |
| US-03 Player profile, game-by-game points | 3.3, 3.4, 5.2 |
| US-04 Standard / Half-PPR / PPR everywhere | 3.2, 5.2–5.6 |
| US-05 Recent opportunity vs baseline | 3.5, 5.2, 5.3 |
| US-06 Projections with provenance and uncertainty | 3.6, 6.1–6.9 |
| US-07 Compare two players | 5.4, 6.9 |
| US-08 Freshness and missing sources | 1.6, 2.5, 5.6, 5.8, 5.9 |
| US-09 Methodology and out-of-sample performance | 5.5, 6.7, 6.9, 7.2 |
| US-10 (P1) Tracker filters | 5.3 (core filters) |
| US-11 (P1) Opponent-adjusted context | 6.4 candidate feature; displayed after the MVP only if it helps |
| US-12 (P1) Past forecasts vs actuals | 6.3, 6.9 (`/performance`) |

**Other requirement sections:**

| Requirements section | Steps |
| --- | --- |
| §0 Working rules | [How we work](#how-we-work), [Change safety](#change-safety) |
| §1.5 Success conditions | Gates C–F |
| §2 Team research features | [Phase 0](#phase-0--foundation-built), 5.6 |
| §3 Routes and interface contracts | 5.1–5.7, 6.9 |
| §4 Scoring specification and its tests | 3.2, 3.3 |
| §5 Data sources, the source readiness report, licensing | [Data sources](#data-sources-verified-2026-10-21), 2.1–2.7, 7.3 |
| §6.2 Tables (raw, staging, marts, forecasts, run records) | 1.6, 2.3–2.5, 3.1–3.7, 6.2, 6.3 |
| §6.3 Identifiers and join correctness | 2.4–2.6, 3.1, 3.3 |
| §6.4 Pregame temporal invariants | 3.6, 6.1, 6.2, 6.5 |
| §6.5 Storage budget | [Storage](#storage-and-operating-budget), 2.1, 2.7, 3.7 |
| §7 Delivery requirements by phase | Phases 1–7 |
| §8 Test matrix | Data correctness 2.6, 3.1; scoring 3.2; opportunity 3.5; leakage 3.6, 6.5; modelling 6.3–6.7; UX 5.7; security 1.5, 7.4; operations 1.6, 5.8–5.10; attribution 5.6, 7.3 |
| §9 Gates and the fallback hierarchy | [Release milestones](#release-milestones); fallbacks in 2.5, 5.9, 6.4, 6.6, 6.9 |
| §10 Scope management | [Phase overview](#phase-overview) estimates; cut optional work before correctness |
| §11 Learning checkpoints | The checkpoint at the end of each phase |

## After the MVP

Not part of any step above; tracked in `docs/parking-lot.md`.

**Fantasy ideas:**
- Injury report designations. nflverse holds them in season today, but requirements §1.4 leaves them out of the MVP. Revisit with a freshness gate.
- Red-zone and route-level roles from play-by-play player IDs. These need a full play-by-play reload.
- nflverse's expected fantasy points (`load_ff_opportunity`) as a comparison.
- Opponent-adjusted context on the pages (US-11), if 6.4 shows it helps.
- Kickers and team defenses.

**Research ideas** (for the Research section):
- Forecast-weather snapshots, and a check of Open-Meteo's archive of past forecasts.
- This season's situational effects against history.
- A weekly situational recap.
- The existing parking-lot items.

**Not planned:** odds or line snapshots, fair totals, a betting ledger and closing-line value. Requirements §1.3 rules out betting features.

## Sources

- [nflreadpy load functions](https://nflreadpy.nflverse.com/api/load_functions/)
- [nflreadr player stats dictionary](https://nflreadr.nflverse.com/articles/dictionary_player_stats.html)
- [nflverse data schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
- [nflreadr `load_snap_counts` (Pro Football Reference)](https://nflreadr.nflverse.com/reference/load_snap_counts.html)
- [nflreadr `load_participation`](https://nflreadr.nflverse.com/reference/load_participation.html)
- [nflverse licensing](https://github.com/nflverse) and [nflverse-data licence](https://github.com/nflverse/nflverse-data/blob/master/LICENSE.md)
- [Neon pricing (Free plan limits)](https://neon.com/pricing)
- [nflreadr schedules data dictionary](https://cloud.r-project.org/web/packages/nflreadr/vignettes/dictionary_schedules.html)
