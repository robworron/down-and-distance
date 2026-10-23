# Down & Distance — Product Requirements
## Fantasy football research application: MVP requirements, delivery requirements and acceptance criteria

**Version:** 1.0
**Date:** 2026-10-21
**Status:** Phase 0 of `docs/build-plan.md` (the NFL data pipeline, dbt warehouse, team analysis and team research pages) is built, and so is Phase 1 (baseline and reliability), verified on 2026-10-23. The fantasy features in Phases 2–7 are planned, not built. This document is the product specification; `docs/build-plan.md` is the implementation roadmap, and `docs/decisions.md` records the technical decisions.
**Intended implementer:** Claude Code, directed and reviewed by the project owner.
**Priority:** Equal weight to weekly personal usefulness and demonstrable engineering/analytics skill.

---

## 0. Working rules for Claude Code

Treat this document as the **target product specification**, not permission to change the repo in one pass. Verify the actual repository, data and test results rather than trusting a checkmark in a plan.

**Safety and change-control rules:**

1. **Do not delete, truncate, drop, or overwrite production data or working features without explicit owner approval.** Back up/schema-export before schema changes and prefer additive, reversible changes. The team research pages stay available under a `Research` area.
2. **Do not run all phases in a single uncontrolled operation.** Implement one numbered step, run its acceptance checks, show the changed files and findings, and commit only after the checks pass. Commit messages start with the step number (e.g. `2.3: load weekly player stats`).
3. **Don't silently invent data.** Never fabricate player statuses, snap shares, historical injury records, forecasts, or model performance. Show `Unavailable` or a clearly labelled fallback. Do not hardcode fake production values.
4. **Preserve the core stack and deployment** unless evidence proves a change necessary; propose deviations rather than making unilateral infrastructure changes.
5. **Do not install paid providers or incur costs** without consent. Verify current free-tier limits and storage before enabling new loads.
6. **Check licensing, attribution, and right-to-display for every dataset or image source** before public launch. In particular, do not assume all nflverse sub-datasets share the same license.
7. **Respect temporal correctness:** all forecast features must derive from data available at the forecast cutoff; historical final results cannot leak into pregame rows.
8. **Protect secrets:** never log connection strings/credentials; use `.env`, GitHub Secrets, least-privilege DB accounts, and server-side queries.
9. **Prefer simplicity:** no user accounts, league integrations, on-demand ML service, LLM-generated insights, or additional infrastructure for MVP.
10. **If a source fails its data-coverage gate, degrade gracefully** and document the missing feature instead of claiming it works.

Claude Code writes all code, including SQL, statistics and analysis, and explains each SQL- or analysis-heavy step to the owner afterwards, clause by clause.

---

## 1. Product definition

### 1.1 Vision

**Down & Distance** is a free, public, mobile-friendly, explainable **fantasy football research application**. Each week, a fantasy manager can discover meaningful player opportunity trends, examine why performance has changed, view independently produced fantasy-point projections, and compare likely outcomes between two players.

The product is **not** a fantasy league host, betting service, paid-contest optimizer, news aggregator, or guaranteed prediction engine.

### 1.2 Primary audience and jobs to be done

- **Primary:** An NFL-knowledgeable fantasy football manager who wants more context than a simple box score.
- **Secondary:** Other fantasy managers who want understandable player trends and comparisons.
- **Portfolio:** Interviewers reviewing the data architecture, automated pipeline, dbt lineage, model evaluation, Next.js UI, and agent-assisted development methods.

Primary recurring question: **“What changed in this player's role, how could that affect this week's fantasy production, and how uncertain is the projection?”**

### 1.3 Explicit MVP product decisions

- **Positions:** QB, RB, WR, TE. Exclude kickers and team defenses at launch.
- **League format:** NFL regular season only for fantasy views and forecasts. Historical playoff records may remain in raw data and research pages but are excluded by default from fantasy calculations.
- **Scoring:** Standard (0 PPR), Half-PPR (0.5/reception), Full-PPR (1/reception); shared point rules otherwise. No configurable league-specific bonuses at launch.
- **Access:** Public site with no accounts/login; links and URL filters are shareable.
- **Forecast horizon:** Next scheduled regular-season game for eligible players; weekly projections built by scheduled batch job, not on request.
- **MVP projection:** One statistically sound **baseline**, not a promise of advanced machine learning. Any more sophisticated model must earn inclusion by testing better on held-out seasons.
- **MVP opportunity signal:** Transparent changes in volume and role, **not** a proprietary “breakout probability” presented without validation.
- **No gambling support:** No sportsbook feeds, odds, wagers, DFS paid-contest features, or expected-money-return recommendations.
- **Brand:** Keep Down & Distance, current repo/domain, and current stack unless the owner later elects to rename.

### 1.4 User stories and priority

**P0 — must work for launch**

- US-01: As a visitor, I can view this week's scheduled games and navigate to eligible players on either team.
- US-02: I can search players by name and filter by position/team, with stable player URLs.
- US-03: I can open a player profile and see game-by-game fantasy points and production by season/week.
- US-04: I can select Standard, Half-PPR, or PPR and receive mathematically correct points everywhere consistently.
- US-05: I can inspect a player's **recent opportunity** (targets, carries, team share, snaps when available) versus season baseline.
- US-06: I can view upcoming-week **point projections** with provenance and uncertainty or an explicit ‘insufficient data/unavailable’ state.
- US-07: I can compare two eligible players side by side using the same scoring rules, forecast cutoff, and explained supporting data.
- US-08: I can see when the data and forecasts were last refreshed and whether a source is missing/stale.
- US-09: I can read how statistics, projections, and confidence ranges were calculated and review out-of-sample model performance.

**P1 — high-value but only after P0 quality gates**

- US-10: I can filter a position-level Opportunity Tracker by week, team, minimum opportunity, and trend magnitude.
- US-11: I can compare a player's recent performance with opponent-adjusted team defensive tendencies **if validated**.
- US-12: I can inspect historical prediction-versus-actual results for prior weeks.

**Not MVP:** Account sign-in; ESPN/Yahoo/Sleeper integration; importing rosters; custom scoring editors; trade analyzer; waivers and transactions; live play-by-play; news or injury-report aggregation; advanced route participation not proven available in-season; AI-generated advice; push notifications; paid contest tools.

### 1.5 Success conditions

The MVP is successful only if:

1. An NFL fan can get from homepage to any supported player in **three interactions or fewer**.
2. A visitor can understand *why* an opportunity trend changed, with underlying week-level values and sample sizes.
3. Fantasy scoring is correct and consistent across all screens, with unit tests covering edge cases.
4. Pre-game forecasts are stored immutably with an `as_of` cutoff and graded afterward without modifying the original predictions.
5. At least one historical holdout season is evaluated against simple baselines; no unearned “edge” or accuracy claims.
6. Pipeline and web app run unattended in production during the NFL season, with visible freshness and recoverable failures.
7. A reviewer can trace any displayed figure through query → mart → staging/raw → source and reproduce model evaluation locally.
8. The deployed production instance contains no fabricated values or secrets, and source attribution/licensing is documented.

---

## 2. Team research features and core data

Alongside the fantasy features, the application keeps its team-level NFL research: team pages, the situation explorer, leaderboards and a situational week view, built on the same pipeline and warehouse.

| Area | Role | Requirement |
| --- | --- | --- |
| Monorepo, uv, Docker, Neon, Vercel, GitHub | Platform | No setup rebuild |
| `raw.schedules`, `raw.teams`, `raw.pbp` | Core data | Preserve joins, roster/team-code consistency, player identifiers |
| Stadiums, weather, travel and rest | Optional context | Used in projections only with a proven gain; no need to extend now |
| dbt `team_games`, team game stats | Core context | Opponent and pace context; don't force player data into this grain |
| `mart_team_splits`, league splits | Research | Not used directly as player projections |
| Situation filters, including spread role | Research, secondary | The explorer lives under `/research`; no new betting-related features |
| Teams index and team pages | Research | Link to the team's player list and upcoming schedule once player pages exist |
| `/this-week` | Fantasy | Fantasy-relevant games and teams, linking to player research; the situational week view lives under `/research` |
| raw/staging/marts and the read-only web account | Core | Add player tables/models without breaking existing reads |

**Change strategy:** Additive first. Keep the research routes working until the new pages pass their acceptance tests. Change navigation, and redirect the research routes under `/research`, only after the new views work. Split query functions by domain only when warranted. Never delete a research page because it is no longer the landing page.

---

## 3. User-facing information architecture and interface contracts

### 3.1 Navigation

Main: **This Week**, **Players**, **Opportunity Tracker**, **Compare**, **Methodology**. Keep **Research** as a secondary link to existing team/situation views.

Suggested routes (verify route conflicts before creating):

- `/` — home redirects or presents This Week.
- `/this-week?season=2026&week=7&scoring=ppr` — scheduled games, data freshness, featured players (no hard-coded data).
- `/players?search=...&position=WR&team=BUF` — search/filter/sort/pagination.
- `/players/[playerId]?season=2026&scoring=half` — player profile (stable GSIS-derived ID encoded safely in route).
- `/opportunity?position=WR&window=3&week=7` — transparent opportunity trends.
- `/compare?playerA=<id>&playerB=<id>&week=7&scoring=ppr` — two-player side-by-side.
- `/methodology` — scoring, data, forecasting, uncertainty, limitations, credits.
- `/performance` — historical out-of-sample forecast results, and later archived production forecasts.
- `/research/...` — existing team/situational pages, where practical, with redirects for existing inbound links.

Use URL search params for shareable state, safe input parsing, accessible controls and graceful errors. No client-side direct database connections.

### 3.2 This Week page — minimum UI

- Current NFL season/week, clear definition (regular-season games; handle byes, Tuesday/Saturday games, season transitions).
- Game cards showing opponent, date/time (timezone-aware), weather only if supported and relevant, links to player lists.
- A player-selection/search entry point and link to Compare.
- Section showing recently changed **opportunity**, sorted by transparent metric, only after opportunity models exist.
- Data-update timestamp and source coverage banner.
- During the offseason: provide last completed season/week and player research instead of a misleading empty upcoming schedule.

### 3.3 Players index

Search by display name; filters for position, team, season and status of sample size; sortable by supported metrics (recent points, targets/carries, season points). Include skeleton, zero-results, stale data, and unavailable states. Prefer server-side pagination and indexed queries; never download all historical rows to the browser.

### 3.4 Player profile

At minimum:

- Name, position, current/relevant team, next opponent if scheduled; player photo **only if license/right-to-display is validated**, otherwise neutral avatar.
- Explicit scoring format selector; season/week selector; data freshness.
- Weekly fantasy points chart and table (regular season only).
- Relevant counting stats by position: QB attempts/completions/pass yards/pass TD/INT/rush; RB carries/rush yards/targets/receptions/receiving yards; WR/TE targets/receptions/receiving yards; supported touchdowns/fumbles.
- Recent 3 games, recent 5 games, and season-to-date comparisons with **games played as denominator**.
- Opportunity indicators: target share and carry share derived against actual team totals; offensive snap share **only when source coverage confirmed**.
- Upcoming projection and uncertainty/fallback state; short evidence list grounded in displayed data.
- Explicit mark for bye week, no game, inactive/DNP, no available projection; do not conflate null with zero.

### 3.5 Opportunity Tracker

Position filter; rolling-window selector (3 or 5 completed games); season/week controls; minimum-volume filter; recent-vs-baseline comparisons; an explanation of thresholds and sample sizes. Display **both the raw count and relative change**. Examples: WR target share, RB share of team carries, player offensive snap share (optional), QB pass attempts (volume), TE targets.

Do **not** label a player a guaranteed breakout. If providing a highlighted category such as `Usage rising`, define its deterministic rule in methodology, permit `insufficient sample`, and disclose that opportunity is not the same as expected production.

### 3.6 Weekly projections

Forecast one **upcoming game** per active eligible player, keyed by season, week, player ID, scoring format and immutable forecast version. Show projected fantasy points, an approximate uncertainty interval or explicit ‘range not yet validated,’ model name/version, generation timestamp, games contributing to the forecast, and key input features. If insufficient data, show fallback method and lower confidence or `unavailable` — don't present an invented precision.

### 3.7 Start/Sit Compare

Two-player comparison for the **same week and scoring setting**, with:

- projected fantasy points (or both unavailable), historic recent points, opportunities, upcoming opponent, playing status when verified, and uncertainty;
- context factors with dates and sample sizes;
- no fabricated advantage score or certainty claim;
- accessible handling of the same player selected twice, unsupported position, byes and stale forecasts.

Do not imply a particular lineup choice is certain. Show comparisons and explain evidence without overclaiming.

### 3.8 UX/nonfunctional standards

Responsive down to 320px screen width; keyboard-accessible navigation and forms; readable chart alternatives/tables and accessible labels; sensible dark/light styling inherited from existing UI; no large layout shifts. Avoid noisy animations. Users should never be shown raw SQL errors. Choose explicit time zones for kickoff labels and UTC for stored times. All forecast-related badges must reflect real provenance and age.

---

## 4. Fantasy scoring specification (one canonical calculation)

Scoring MUST be centrally defined and tested, not separately hard-coded in Python/SQL/TypeScript.

**Default non-PPR point rules (MVP):**

| Statistic | Points |
| --- | ---: |
| Passing yards | `+0.04` per yard (1 per 25) |
| Passing touchdown | `+4` |
| Interception thrown | `-2` |
| Rushing yards | `+0.1` per yard |
| Receiving yards | `+0.1` per yard |
| Rushing touchdown | `+6` |
| Receiving touchdown | `+6` |
| Completed passing/rushing/receiving 2-point conversion | `+2` |
| Fumble lost | `-2` (count once from canonical underlying field) |
| Reception | `+0` Standard; `+0.5` Half-PPR; `+1` PPR |

- Do not include generic per-completion, 100-yard bonuses, yardage tiers, first downs or custom settings at MVP.
- Define how player special-teams TDs are treated: include `+6` **only if reliable player-level source and deduplication exist**; otherwise mark unsupported and exclude consistently, documenting coverage.
- Clarify whether all available negative yard values are scored as provided, including negative rushing/receiving yardage.
- Scoring for a player who played and had no stats is `0`, but `DNP` is not automatically a `0` in averages/projections.
- Use source's `fantasy_points` and `fantasy_points_ppr` as comparison checks when their definitions match, not as the only implementation.
- Use one canonical scoring function/specification consumed consistently (e.g., SQL macro for persisted points plus equivalent shared fixture tests in Python/TS). Prevent cross-language drift with identical test fixtures.

**Tests required:** QB dual-threat performance; WR 8 receptions; RB with rushing and receiving touchdowns; passing 2-point conversion; fumble lost without duplicate deductions; negative yardage; DNP vs game played; fractional PPR consistency; missing source value handling. Compare known historical games to independent recorded box scores and reconcile discrepancies.

---

## 5. Data sources and feasibility gates

### 5.1 Primary preferred sources

Verify these exact functions and actual schema by running a sample load in the installed version before implementing dependencies:

- `nflreadpy.load_schedules(...)` — schedule, game IDs, game type, season/week.
- `nflreadpy.load_player_stats(seasons=..., summary_level='week')` — canonical weekly player statistics. Check available fields against player-stats dictionary, including `player_id`, `game_id`, `team`, `opponent_team`, attempts, targets, rushing/receiving yards, TDs, turnovers and two-point conversions.
- `nflreadpy.load_rosters(...)` or `load_rosters_weekly(...)` — player identity, team/position and week-specific roster status **if coverage is current**.
- `nflreadpy.load_snap_counts(...)` — offensive snap counts and shares, joinable to GSIS IDs through `load_players()`. **Required** (see §5.4).
- Play-by-play data (loaded since 2016) — optional advanced usage/route-like metrics **only when valid**; avoid duplicating player-game totals inconsistently.
- The team-game mart — context such as pace, recent team efficiency and opponent tendencies.

**Source restrictions:** nflverse participation after 2022 is released after the postseason (not a reliable current-season weekly source for 2023+). Do **not** make current-week route participation, full on-field player participation, or route share a mandatory MVP dependency. Injury designations are not part of the MVP (§1.4), whatever the injury feed's currency; do not show purported live injury designations. Data that is absent or delayed must produce `unavailable`, not imputed observations.

### 5.2 Source readiness report (required before implementation)

Generate `docs/fantasy-source-audit.md` with a table per source covering:

1. API/function and pinned library version;
2. sample season(s) and row counts;
3. actual fields, types and join keys;
4. last observed update and current-season coverage;
5. player/position/season coverage rate;
6. duplication/null/identity anomalies;
7. license, attribution and display restrictions;
8. whether it is **required**, **optional**, or **not feasible for MVP**.

If weekly player stats are missing a proposed metric, revise its acceptance test openly instead of sourcing it from an undocumented feed. Keep raw captures small; check that play-by-play hasn't exhausted the free-tier headroom.

### 5.3 Licensing and image guardrails

nflverse states that most released datasets use **CC BY 4.0** and FTN-derived datasets use **CC BY-SA 4.0**; check the **exact dataset release/license** before redistribution or derived-use decisions. Attribute providers as required and avoid restricted or misleading NFL/team endorsements. Logo and player-photo availability in the data **does not alone guarantee a right to redistribute the images**; use neutral text/avatar fallbacks when uncertain.

### 5.4 Verified source decisions

Verified on 2026-10-21; the numbers are in `docs/build-plan.md` (Data sources).

- **Snap counts are required.** A player gets a weekly stats row only when he records a stat, so 12.7% of skill-position appearances since 2016 have no stats row. Snap counts are the verified way to tell "played and scored 0" from "did not play". If their coverage fails, snap share is omitted (fallback 1), and players without a stats row are shown as unknown, never as did-not-play.
- **Player data starts in 2016.** nflverse has almost no targets for 2003–2008.
- **Weekly stats, not play-by-play,** supply every MVP metric; play-by-play is team context and is not reloaded.
- **Spread and total lines are not model inputs.** They have no point-in-time history, and §1.3 rules out betting features.
- **Python converts nflverse output to pandas immediately;** no Polars code.

**Reference documentation to verify at implementation time:**

- https://nflreadpy.nflverse.com/api/load_functions/
- https://nflreadr.nflverse.com/articles/dictionary_player_stats.html
- https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html
- https://nflreadr.nflverse.com/reference/load_participation.html
- https://github.com/nflverse/nflverse-data
- https://github.com/nflverse

---

## 6. Target architecture and data contracts

### 6.1 Flow

`nflverse + Open-Meteo weather` → **Python ingestion (nflreadpy, converted to pandas)** → `raw` PostgreSQL → **dbt staging** → **dbt marts / pregame features** → **Python batch projections, archive & grades** → **read-only Next.js server queries** → UI. GitHub Actions runs ingestion, dbt tests/build, predictions, grading and cache refresh.

### 6.2 Grain, keys and core tables

**Raw (add without altering existing tables unless unavoidable):**

- `raw.player_stats_weekly`: grain `(player_id, game_id)` for regular game records; preserve `season`, `week`, `season_type`, `team`, `opponent_team`, and raw source fields. If source has multiple rows per player per game/team, establish explicit aggregation and test it rather than blindly upserting.
- `raw.rosters_weekly`: source-defined `(season, week, player_id, team[, snapshot/as_of])` grain after verifying dataset; source timestamp if supplied.
- `raw.snap_counts`: player-game or player-week as verified by actual schema. Explicit source and completeness fields.
- `raw.source_loads`: source, season, fetched_at, status, rows, hash/schema version/notes.

**Staging:**

- `stg_player_stats_weekly`, `stg_players`, `stg_rosters_weekly`, optional `stg_snap_counts` — standardized IDs, team alias mapping, positions and typing, regular/postseason discrimination; check duplicates and nulls.

**Marts:**

- `dim_players`: one canonical row/player with stable ID, display name, supported primary position, current/relevant team and provenance; avoid false certainty during team changes.
- `fct_player_games`: one row per `(game_id, player_id)`, joined to schedule, team and opponent; supported box-score measures plus calculated Standard/Half/PPR points, `played_game` and `data_complete` flags.
- `mart_player_weekly`: one row per `(season, week, player_id)` for regular-season fantasy UX. If player has multiple actual games in one schedule week, define aggregation and preserve game linkage.
- `mart_player_opportunity`: per-player per week, prior completed games, rolling target/carry volumes, team shares, recent delta vs season/prior baseline and sample sizes.
- `mart_player_pregame_features`: **one row per eligible player + target game + feature cutoff**, created from earlier available games only; include null/unknown flags.
- `mart_team_pregame_context`: existing team-game prior-form and upcoming opponent context, optional for MVP projections.
- `mart_player_projections`: immutable forecast records including forecast ID, `model_version`, `as_of_utc`, `generated_at_utc`, `target_game_id`, season/week, player ID, scoring format, projected points, range and fallback reasons; best stored by **model run and cutoff**, not simply overwritten each day.
- `mart_projection_grades`: link original forecast ID to actual game, fantasy points, abs error, evaluated timestamp and completeness.
- `pipeline_runs` or existing equivalent: step statuses, time, rows, fail reason (sanitized).

**Physical schema note:** model name examples above describe **logical outputs**. Do not force every table into dbt if Python logically owns it. Define where forecast artifacts live (`predictions` or `marts` as appropriate) and grant reader only necessary SELECT. Avoid circular dbt dependencies on Python-created prediction tables.

### 6.3 Required identifiers and join correctness

- Use GSIS `player_id` where supported; do not join on display names.
- Use nflverse `game_id` as stable game key; keep NFL `season`, `week`, and `game_type` rather than inferring a season from calendar year.
- Normalize historical relocations/team abbreviations deliberately; join players to **their team for that game**, not today's team.
- Test player-team-opponent matches schedule for each game; verify trades, byes, player DNP, duplicate IDs and same-name players.
- For team opportunity shares, numerator and denominator must refer to the **same team, game, season and stat type**. No divide-by-zero; minimum denominator and valid sample required.

### 6.4 Pregame temporal invariants (non-negotiable)

- Each feature row has `feature_cutoff_utc`; join only observations with `game_end_utc` or true source availability time **strictly before cutoff**. For historical stats without exact publication timestamps, use conservative prior-completed-week boundaries, not simulated same-day availability.
- Forecast `as_of_utc < kickoff_utc`. Regenerated forecasts get new IDs/versioned rows; prior rows remain.
- No outcome, final in-game stats, postgame snap count, final weather, future roster state, or current game's player points in a pre-game feature.
- In rolling SQL use explicit ORDER BY and `ROWS BETWEEN N PRECEDING AND 1 PRECEDING` or an equivalent strictly lagged method; handle 0- and 1-game histories.
- Historical backtests reconstruct only known prior information. If source has been retrospectively corrected without snapshot history, document limitations and do not claim full point-in-time fidelity.
- Require automated **leakage tests**, including deliberately corrupted future rows that must not change a prior projection.

### 6.5 Storage and operational budget

The project targets **Neon Free** and holds play-by-play since 2016. Confirm actual storage and index usage with `pg_total_relation_size`, row counts, index sizes and free-tier limits before adding player tables. Neon announced **1 GB/project** on 2026-10-02; limits and other allowances can change. Avoid persisting multiple redundant large copies of PBP/participation. Project storage after proposed datasets. Don't assume ‘$0’ without measurements and checking API provider terms.

---

## 7. Delivery requirements by phase

The phases match `docs/build-plan.md`, which breaks each into numbered steps. Phase 0 (the foundation) is built.

### Phase 1 — Baseline and reliability

- **Inventory and test baseline.** Run safe local commands for web lint/typecheck/build, Python tests and dbt build. Record failures without blindly repairing unrelated code. **Done when:** every result is recorded.
- **Restore point.** Create a tag and schema backup where authorized, with the backout documented, and confirm the read-only production role. **Done when:** a rollback path is documented and no destructive production operation is needed.
- **Architecture and data ownership.** Document how the player modules fit the stack. **Done when:** they need no new backend service (`docs/build-plan.md`, Architecture).
- **Loading, error and 404 states, page metadata, and protected cache invalidation.** Revalidation must support the player pages and projections as they are added. **Done when:** the existing pages pass smoke checks.
- **A scheduled refresh** of the existing data, with run records and visible freshness. This is the first version of the automation in Phase 5.

### Phase 2 — Player data

- **Source probe.** Load one completed season and a recent week of `load_player_stats(..., summary_level='week')`. Inspect schemas, count records, and identify the GSIS/game IDs and the fields needed for scoring and targets/carries. **Done when:** the source audit includes validated field names, types and samples.
- **Play-by-play selection.** Don't reload or duplicate historical play-by-play unless the source audit proves a need. **Done when:** `docs/fantasy-source-audit.md` states which requirements use weekly stats and which use play-by-play.
- **Incremental weekly player stats ingestion.** Season (or week) selection and a re-runnable idempotent upsert. Store source/load timestamps, logs and a row-quality report; don't delete historical rows on a transient source failure. **Done when:** two runs give the same keys and counts, and a corrected source row updates predictably.
- **Player identity and roster ingestion.** Stable IDs, normalized teams, position eligibility and year/week context. Don't silently resolve ambiguous IDs by name. **Done when:** eligible fantasy stat rows resolve to an ID and team, with exceptions documented.
- **Snap counts ingestion with an explicit gate.** Validate current- and historical-season coverage, ID mapping and source license (§5.4). **Done when:** snap metrics pass the coverage tests, or the fallback in §5.4 is applied and documented.
- **Data-quality checks.** Duplicate keys, missing IDs, stat ranges, schedule joins, season/week game types, source freshness and data completeness. **Done when:** deliberately introduced duplicates and orphan game/player rows fail the tests.

### Phase 3 — Fantasy transformations

- **Staging contracts.** Standardize weekly stats, roster/source table definitions and player/team identity. **Done when:** `dbt build` validates unique keys and accepted values.
- **Canonical fantasy scoring.** Documented scoring rules and shared fixtures, with all three scoring outputs generated. **Done when:** the fixtures and spot checks match independently computed outcomes.
- **`dim_players` + `fct_player_games`.** Join player-game stats to the schedule correctly, handling trades, missing rosters, DNP and playoffs. **Done when:** sampled historical performances match source/box-score figures and the grain uniqueness tests pass.
- **`mart_player_weekly`.** Query-friendly regular-season history with correct zero-vs-null status. **Done when:** every played player-game appears once in the correct season/week, and the scoring filters need no client recomputation.
- **Opportunity aggregates.** Targets/game, carries/game, shares and 3-/5-game trends from completed games only, with snap share where available. No hidden imputation. **Done when:** one WR and one RB reconcile by hand over several weeks, and zero/low samples are handled.
- **Pregame features.** `mart_player_pregame_features` with its grain, cutoff and leakage tests, and conservative treatment of missing injury/snap data. **Done when:** the leakage tests pass.
- **Performance and storage.** Indexes on the actual filter/join columns, and validated query plans for player search/history and week views. **Done when:** production-size query samples run within reasonable latency and free storage headroom remains.

### Phase 4 — Fantasy analysis

The team situation research and its notebooks remain as supporting research.

- **Production sanity check.** Validate points by position and season, outliers, missing games, scoring consistency and target/carry definitions. **Done when:** a reproducible notebook and a discrepancy log exist.
- **Opportunity signal analysis.** Test whether last-3-/5-game target/carry volume or share predicts next-game opportunity or points better than the season average, using past-to-future comparisons only. Report sample sizes, subgroup limitations and negative findings. **Done when:** reproducible charts and one written conclusion exist.
- **Forecast baseline assessment.** Evaluate lagged rolling fantasy-point averages and season-to-date averages on held-out seasons. Separate QBs, RBs, WRs and TEs, report MAE, and evaluate only games with a valid eligible player/game status. **Done when:** the baselines and evaluation cohorts are documented, and no model is selected on the test season alone.
- **Publish the findings.** Document whether opportunity trends genuinely improve predictions and what remains unproven. **Done when:** the portfolio story includes a measurable result, not just charts.

### Phase 5 — The fantasy site and weekly reliability

**The fantasy site:**
- **Typed query modules.** Prefer `lib/queries/players.ts`, `opportunity.ts`, `projections.ts` and `games.ts`, alongside `teams.ts` and `situations.ts`; refactor only the files necessary. Parameterize inputs and read from marts as the read-only role. **Done when:** no public page queries a raw table, and invalid IDs or filter parameters fail safely.
- **Player index and player detail.** First without predictions, showing verified season/week stats and the scoring format. **Done when:** two manually checked player histories match the database outputs on desktop and mobile.
- **Opportunity Tracker.** Transparent calculations, a minimum-sample filter, source coverage and true missing-data states. **Done when:** sorting and filters reflect SQL, not prefilled/static data.
- **Comparison.** Player selection and side-by-side historical/opportunity stats; the projection section is added once Phase 6 is complete. **Done when:** the same scoring filter and season/week apply to both players.
- **This Week.** Connect game cards to team players and player search, and show the last-loaded timestamp. **Done when:** the upcoming slate works and the offseason fallback is clear.
- **Navigation and URLs.** The fantasy pages lead the navigation, with research secondary; research URLs redirect. **Done when:** no link is broken.
- **Accessibility, responsive and integration tests.** Verify 320/375/768/desktop widths, keyboard and URL state, missing IDs, 404s and mobile charts. **Done when:** a documented smoke test suite passes.

**Weekly reliability.** A scheduled GitHub Actions workflow:
1. Fetch schedules and incremental current-season player stats, rosters and validated snaps.
2. Load raw data with idempotent upserts, recording source freshness and failures.
3. Run dbt build/tests; block publication if critical integrity tests fail.
4. Create/update the fantasy opportunity marts.
5. Generate projections **after** a successful data/feature refresh and archive their versions; skip gracefully where source data is late (from Phase 6).
6. Grade eligible forecasts for completed games without rewriting pregame rows (from Phase 6).
7. Refresh Next.js caches using a protected endpoint/tag invalidation, and verify the update timestamps.
8. Run CI on PRs: TypeScript lint/typecheck/build, Python lint/tests, dbt compile and tested SQL.

**Frequency:** daily in season is adequate for the MVP. Document the UTC cron and its trade-offs, and don't imply real-time injury status or live stats. A manual rerun of the workflow must be safe. If a stage fails, retain the last successful published data and show a stale status.

**Done when:** a controlled test runs ingest → dbt → UI refresh successfully, and a simulated failure leaves the previous public pages available. The forecast and grade stages join the same test in Phase 6.

### Phase 6 — Forecasting and evaluation

- **Formal target and cohort.** One completed regular-season player-game fantasy-point target at QB/RB/WR/TE. Clearly distinguish forecast eligibility from eventual DNP/availability changes. Define the cutoff before kickoff and the scoring choices, and the inclusion policy for rookie and low-history players.
- **Baselines first.** Lagged season-to-date fantasy points per game and 3-/5-completed-game moving averages. Avoid fake precision, and select the fallback by validation, not intuition. Support an insufficient-data "unavailable" state for rookies.
- **Opportunity-aware candidate.** An optional simple or regularized linear model with prior-only targets/carries, team volume, player efficiency, position and opponent/team context. No LightGBM until simple models prove useful. Spread and total lines are not inputs (§5.4). Either forecast stat components and apply scoring, or forecast total points; document the approach and its trade-off.
- **Time-based validation.** Choose features on earlier seasons and test on later, untouched seasons: development 2017–2023 (walk-forward), validation 2024, a test season 2025 opened once, and 2026 as the live holdout. Evaluate per position, scoring format, week and sample cohort with MAE, mean bias and interval coverage if ranges are displayed. Compare with naive baselines; no randomly shuffled game split.
- **Honest uncertainty.** If enough evaluation observations exist, calibrate an empirical 80% range from past validation residuals, stratified by position where sample size allows. Otherwise omit ranges and label the limitation; never show an arbitrary ±10% band.
- **Immutable forecast snapshots.** Each batch stores the forecast ID, generated_at, feature cutoff, target game, player ID, scoring format, features/model version, prediction and optional range, with status/fallback reasons. The UI chooses the latest valid **pre-kickoff** snapshot and never replaces previous snapshots.
- **Grade, evaluate and publish performance.** After the final data settle, link each projection to its actual result, compute errors, and show the measured track record on `/performance` with cohort sizes and honest baselines. Keep the holdout separate from training.
- **Explain predictions without generated narratives.** Show deterministic evidence from prior data: projected opportunity, recent volume, historical efficiency and freshness. A feature's presence is not proof of causality.

**Done when:** a past-season replay generates point-in-time-valid predictions, passes the leakage tests, and outputs position-specific holdout accuracy beside simpler alternatives; and the published snapshot is auditable after games conclude.

### Phase 7 — Release, documentation and portfolio

- Polish the home, Player Research, Tracker, Compare, Methodology and Performance routes.
- A README with the architecture, setup, project screenshots, data sources, dbt lineage and reproducible demo commands.
- `docs/fantasy-methodology.md`: scoring rules, denominators, opportunities, the projected-point model, intervals and caveats.
- `docs/fantasy-evaluation.md`: the exact evaluation splits, metrics, sample counts, baselines and negative findings.
- `docs/agent-workflow.md`: the tasks delegated, the tests used, the decisions made by the project owner, and examples of bug fixes and agent corrections.
- Source and license attribution in the repo and in the public footer and methodology.
- Production smoke tests, source freshness, a secure read-only database role, and no production credentials in the frontend or logs.
- A portfolio case study answering: Why this product? How is the architecture layered? Which forecasting signal actually improved results? Which didn't? What comes next?

**Done when:** a new visitor can complete US-01 through US-09 without an account, the production pipeline is verifiably live, and a developer can reproduce the validation results with documented commands and no private credentials.

---

## 8. Cross-cutting test matrix

| Category | Minimum acceptance tests |
| --- | --- |
| Data correctness | Player IDs stable, roster/team joins, correct season/week and game type, deduplication, source completeness, no duplicate player-game grains |
| Scoring | Correct Standard/Half/PPR calculations, fractional reception scoring, interceptions/fumbles, 2PTs, negative yards, DNP versus zero |
| Opportunity | Team denominator alignment, lagged trend calculation, low sample handling, missing snaps represented as missing, correct moving windows |
| Leakage | Future game excluded; future row inserted does not change earlier feature; as-of before kickoff; forecast archive immutable |
| Modeling | Chronological holdout, per-position errors, naive baselines, interval coverage if used, repeated runs reproducible via version/seed |
| UX | Working links, search, filters, responsive charts and tables, 404, empty/stale/failure/offseason/bye-week states |
| Security | Server-only DB access, read-only privileges, validation/parameterization, protected revalidation, no logged credentials |
| Operations | Idempotent load, scheduled/manual reruns, partial-source failure, CI fail on bad schema change/model, freshness and rollback |
| Attribution | Document source licenses, credits, images and restrictions; display no unlicensed assets |

**Performance targets (reasonable, not absolutes):** indexed player search and individual player views should aim for sub-second DB query time with current production data. Key pages target acceptable mobile Core Web Vitals, and scheduled jobs must complete within configured service limits. Measure the actual baseline before setting aggressive performance budgets.

---

## 9. Priority gates

- **Gate A — data first:** Phases 1 and 2 pass and enough verified player stats exist. If not, **stop UI/model work that depends on absent data** and report the gap.
- **Gate B — coherent analysis:** Phase 3's scoring and player-game tables are verified, and Phase 4 shows the baselines' quality. Don't publish misleading opportunity labels.
- **Gate C — useful interactive product:** the Phase 5 site has playable browse, profile, tracker and compare without projections. This can become a public **beta** with clear `Projections coming later` language.
- **Gate D — reliable weekly system:** Phase 5's weekly reliability is automatic, testable and stale-aware; failures recover without losing published data.
- **Gate E — honest forecasting:** Phase 6 has immutable pregame projections, a past-season evaluation and clear accuracy limits. Only then call it **MVP v1.0**.
- **Gate F — portfolio-ready:** Phase 7's documentation, production reliability, README and case study are complete.

`docs/build-plan.md` (Release milestones) lists each gate's checkable acceptance items.

**Fallback hierarchy:**

1. If valid snap counts are absent → show target/carry metrics only and omit snap share entirely; players without a stats row are unknown, not did-not-play.
2. If injury data are absent → omit live availability inference; use the officially established schedule and verified roster only, and show uncertainty.
3. If advanced opponent features don't help holdout accuracy → drop them from the model, keeping team data as descriptive context.
4. If an uncertainty interval can't be calibrated → show the projection with a clear lack-of-range note, or only validated baselines.
5. If projections can't reach adequate data quality → release a labeled research beta, **not** invented forecasts.

---

## 10. Estimated effort and scope management

**Engineering estimates are planning ranges, not commitments:**

| Workstream | Approximate focused effort |
| --- | ---: |
| Baseline and reliability (Phase 1) | 14–24 h |
| Player data and quality checks (Phase 2) | 8–16 h |
| Fantasy marts and scoring (Phase 3) | 14–24 h |
| Analysis and baseline notebooks (Phase 4) | 7–13 h |
| Fantasy site and weekly reliability (Phase 5) | 22–40 h |
| Projections, evaluation and grading (Phase 6) | 20–38 h |
| Portfolio polish, methodology, deploy (Phase 7) | 7–12 h |
| **Total** | **about 90–170 h** |

These ranges assume the core tooling works and the source feeds stay usable. In-season data coverage, schema surprises, historical point-in-time constraints, licensing constraints and database-size limits can change them materially. Revise the schedule after Phase 2.

**Cut scope before cutting correctness:** remove optional snap share displays, matchup adjustments, fancy charts and sophisticated ML before compromising scoring integrity, source honesty, leakage safeguards or refresh reliability.

---

## 11. Owner learning checkpoints

At the end of each phase, the owner should be able to explain without relying on the agent:

- **Phase 1:** the architecture, which components serve which features, the difference between CI and the nightly job, and how to roll a change back.
- **Phase 2:** why GSIS IDs and idempotent ingestion matter; how to check a source's data coverage.
- **Phase 3:** why player-game grain, team-share denominators, zero-vs-null, lagged windows and dbt tests matter.
- **Phase 4:** what the exploratory analysis found, including negative results and sample-size limits.
- **Phase 5:** how a UI figure is queried and traced back to its persisted source; how overnight jobs run, what fails safely and how to recover.
- **Phase 6:** what the model predicts, what features it sees, why it cannot use future data, how it is scored, and which baselines it beats or fails to beat.
- **Phase 7:** which design choices were human-led, which coding tasks were agent-assisted, and how correctness was verified.

Claude Code **explains** major code changes before acceptance, walking through SQL, scoring, window functions, opportunity analysis, baseline comparisons and model interpretation clause by clause.

---

## 12. Source notes

External verification notes, not guarantees about the installed library or deployed runtime:

- Official nflreadpy loader docs list weekly player stats, rosters, weekly rosters, snap counts and participation: https://nflreadpy.nflverse.com/api/load_functions/
- The official player stats dictionary lists GSIS player IDs and week/season context: https://nflreadr.nflverse.com/articles/dictionary_player_stats.html
- The official nflverse data schedule gives each dataset's update schedule; snap counts depend on Pro Football Reference's schedule: https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html
- The official participation documentation states that newer FTN participation is not available in season: https://nflreadr.nflverse.com/reference/load_participation.html
- nflverse licensing distinguishes the default attribution requirements from FTN's share-alike licensing: https://github.com/nflverse
- Neon's announcement of 1 GB per project on the Free plan (2026-10-02): https://neon.com/blog/neon-free-plan-1-gb-per-project
