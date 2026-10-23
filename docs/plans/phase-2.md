# Phase 2 implementation plan: player data (steps 2.1–2.7)

**Status:** **agreed with Rob on 2026-10-23**, after two rounds of review (R1–R8, §13). That covers the plan, decisions P2-D1–D12 as written, and P2-D13 **only as a process**: the investigation in 2.1, the in-memory aggregate exception, and the checkpoint before 2.5. The snap-count rights decision itself (R-a, R-b or R-c) is still Rob's to make, and the plan authorises no use of PFR-derived data. Nothing in Phase 2 is built; the next session starts at step 2.1.

Read this with `CLAUDE.md`, `docs/decisions.md` and Phase 2 of `docs/build-plan.md`. Where this plan and `decisions.md` disagree, `decisions.md` wins. Where a decision below (P2-D1 to P2-D13) amends an earlier one, it says so, and the amendment is recorded in `decisions.md` at the step that lands it.

## Context

Phase 1 is complete. Phase 2 loads the four nflverse player sources the MVP needs into `raw`, from 2016 on: weekly player stats, players, weekly rosters and snap counts. They are checked, repeatable with one command, and refreshed nightly. Phase 2 builds no dbt models and no pages (those start in Phase 3). It ends at Gate A. This plan turns build-plan steps 2.1–2.7 into tasks. They were checked against the code, GitHub and fresh reads of the sources on 2026-10-23, and several facts in the handoff turned out to have changed or to have been measured over a different range.

---

## 1. Current architecture relevant to Phase 2 (verified 2026-10-23)

| Area | State |
| --- | --- |
| Git | `main` = `origin/main` = `3f55aad`, clean tree; tag `foundation` present |
| CI | Green on `3f55aad` ([run 40032884385](https://github.com/robworron/down-and-distance/actions/runs/40032884385)) and on `51fe474` |
| Nightly | One scheduled run so far, [39968873806](https://github.com/robworron/down-and-distance/actions/runs/39968873806), green. Ingest took 10 s, publish 96 s, refresh 11 s; the whole job 2 min 28 s. The next is 2026-10-24 09:30 UTC |
| Phase 1 record | Boxes 1.1–1.6 ticked; `docs/plans/phase-1-verification.md` says every criterion was met |
| Local | Docker `dnd-postgres` is up. Raw is 203 MiB (pbp 198 MiB of it, with its indexes); marts and marts_candidate are 18 MiB each; the database is 250 MiB. Local run records show **0 rows deleted in all 43 loads** |
| Library | nflreadpy 0.1.5, Polars 2.0.0, pandas 3.0.6 (pinned in `uv.lock`) |

**The code paths Phase 2 extends:**
- `pipeline/__main__.py`:
  - `TABLES` (the load order) doubles as the **default for `--only`**, and `nightly.yml` runs `ingest` without `--only`;
  - `RAW_TABLE`; `REQUIRED = {"schedules"}`; `default_loaders`; `combine`.
- `pipeline/db.py` `upsert_dataframe`:
  - one transaction: create the table typed from the first frame, add new columns, COPY into a temporary table, `INSERT … ON CONFLICT … WHERE IS DISTINCT FROM`, then delete stale rows per season;
  - it refuses only an empty season.
- `pipeline/runs.py`:
  - `RunLog`, one autocommit connection per record;
  - `ensure_tables()` runs `run_records.sql` at the start of **every** ingest;
  - `source_loads.status` has a CHECK of (`success`, `failed`).
- `pipeline/publish.py`:
  - locks every table in `raw` (read from the catalogue), with the fingerprint from `_loaded_at`;
  - the gate is `pytest pipeline/tests/test_raw_data.py -m "not advisory"`.
- `transform/models/marts/data_freshness.sql` reads every `table_name` in `raw.source_loads`; `_marts.yml` tests `last_attempt_status` with `accepted_values [success, failed]`.
- `ci.yml` runs `pytest --ignore=pipeline/tests/test_raw_data.py`; the nightly's advisory step runs `test_raw_data.py -m advisory`.
- `web_reader` reads `marts` only. No raw table is visible to the site.

**Discrepancies between the handoff (or build plan) and reality:**

| # | Documented | Found on 2026-10-23 | Handled in |
| --- | --- | --- | --- |
| X1 | 536 placeholder "Team" rows with no `player_id` | 536 is the **1999–2026** count (315 before 2016). 2016–2026 has **222**: one per team-game for 222 team-games. 217 have a null name, 4 are named "Team" and 1 "R.Rodgers". They hold only team defensive stats and penalties, with 0 targets, carries, attempts and points | 2.1, 2.3 |
| X2 | 2 residual team or opponent mismatches, unexplained | **They are 2 of those placeholder rows**, with a null `opponent_team`: `2016_10_CLE_BAL` (CLE) and `2018_07_DEN_ARI` (ARI). All 188,591 rows with an ID match the schedule after the relocation map. 2.3 drops them; nothing to correct | 2.1, 2.6 |
| X3 | 9 player-weeks on two teams (trades) | 2016–2026 has **13**, all one ID: `00-0035718` (Quinnen Williams, NYJ) is also attached to Isaiah Searight (NYG) in 2019, an **ID error** at the source (his own ID is `00-0035478`). There are **no genuine same-week two-team rows** in 2016–2026. Both are listed at DL, outside the recommended trim | 2.4 (Done-when reworded) |
| X4 | 26 null `gsis_id` (2025–26) | 137 null over 2018–2026 (26 in 2025–26), **plus 11 blank-string IDs** | 2.4 |
| X5 | Roster trims "fantasy positions plus FB" | Roster `position` has **no FB**: fullbacks are listed as RB (`depth_chart_position` FB). A QB/RB/WR/TE trim keeps 151,247 of 483,752 keyed rows. It loses **125 REG skill stats rows** (players listed at DB, DL, LB or OL) and 4 snap appearances | P2-D3 |
| X6 | (not documented) | **1,661 roster IDs (12,101 rows) aren't in `load_players()`**, 96% `CUT`. None appears in stats or snaps | 2.4, 2.6 |
| X7 | Mapping 99.80–100% | **99.74–100%** per season; 2026 the lowest (6 of 2,327). Every unmapped case lacks a `pfr_id` in players | 2.5 |
| X8 | Zero-stat appearances 8,381 of 65,965 | 8,305 of 65,909 (12.6%): TE 4,012, WR 2,686, FB 864, RB 609, QB 134 | 2.1 |
| X9 | `REQUIRED` = schedules **and player stats** (`decisions.md`, "Freshness and partial failure") | Code: `{"schedules"}` | P2-D2 |
| X10 | "the player tables added to the nightly job's default list" in 2.7 | Adding a loader to `TABLES` **adds it to the nightly production run at once** (`TABLES` is `--only`'s default). Pushing 2.3 as the code stands would load Neon at 09:30, unapproved | P2-D7 |
| X11 | (not documented) | The raw gate runs every non-advisory check in `test_raw_data.py` on Neon, so a player check pushed before Neon has the tables **stops every nightly publish** | P2-D8 |
| X12 | 2.5: snaps "recorded as not yet published" | A new `status` value breaks the CHECK, `data_freshness`'s test (so the candidate build and the publish) and `last_success`. `ensure_tables` would apply any `run_records.sql` change to Neon on the next nightly, without a backup or approval | P2-D1 |
| X13 | Requirements §7: "don't delete historical rows on a transient source failure" | The upsert deletes any number of stale rows in a loaded season. Only an empty season is refused | P2-D9 |
| X14 | (not documented) | nflreadpy raises `ConnectionError` for a missing file, so the first nightly of a new season would fail. Downloads have no retry. nflverse **replaces** assets on every upload, so a file can briefly answer 404 | P2-D10 |
| X15 | Types | Rosters' `birth_date` is a Polars `Date` (stored as `timestamp` today); snap counts publish counts as decimals; stats publish Int32 (stored as `bigint`) | 2.2 |
| X16 | (not documented) | **nflverse rebuilds past seasons:** every `stats_player_week_*` file was re-uploaded on 2026-08-13, and `snap_counts_2025` on 2026-09-24. A current-season nightly never sees these | P2-D12 |
| X17 | "Snap counts are credited to Pro Football Reference" | Sports Reference's data-use page bars building websites or tools on data scraped from its sites without express permission. nflverse's snap counts are scraped from PFR. It also says facts aren't copyrightable | P2-D13 (2.1) |

---

## 2. Verified player-data source findings (2026-10-23, nflreadpy 0.1.5)

Measured with read-only probes (downloads into memory; nothing written to any database) and GitHub's API. Step 2.1 reproduces it in notebook 07.

| Source | Rows 2016–2026 | Key and integrity | Coverage and timing |
| --- | --- | --- | --- |
| `load_player_stats(summary_level="week")`: 150 columns, all populated in every season | 188,813 (180,934 REG, 7,879 POST); 188,591 with an ID; 2026: 6,558 (weeks 1–7) | `(player_id, game_id)` unique; `game_id` never null, always in schedules; 222 null-ID rows (X1). **Today's** team codes | Every finished game has rows (24–42 per team-game, median 33). Built by nflverse's "Update PBP Related Data" job, dispatched at 09:00 UTC (done by about 09:06–09:14), plus game-day and late reruns |
| `load_players()`: 39 columns | 24,861 | `gsis_id` unique, never null; `pfr_id` 22,696 non-null, unique. Every stats `player_id` is present | Daily at 08:00 UTC |
| `load_rosters_weekly()`: 36 columns | 483,889 (151,247 keyed QB/RB/WR/TE); 2026 weeks 1–7, **including the upcoming week** | Key unique among keyed rows; X3, X4, X6. **Listed** codes (OAK, SD). Released players stay as rows (97,353 `CUT`/`RES` rows), not removed | Every REG skill stats row has a roster row for the same team and week. Daily at 07:07 UTC |
| `load_snap_counts()` (PFR): 16 columns | 261,870; 2026: 8,763 (weeks 1–7) | `(game_id, pfr_player_id)` unique; snap counts are decimals but always whole; rates have 2 decimals (`st_pct` up to 1.01). **Listed** codes, which match the schedule exactly | Every finished game has snaps (34–49 rows per team-game). Thursday's game appeared by 11:32 UTC the next morning. Built at 00, 06, 12 and 18 UTC (September–January, 1–15 February), depending on PFR |

**Reconfirmed facts:**
- **Scoring identity:** 0 mismatches in 188,591 player-games, with player special-teams TDs at +6 and fumbles lost = sack + rushing + receiving. The alternatives give 194 and 432. Negative yards: rushing 1,676, receiving 629, passing 15.
- **Snaps mapping gate:** 99.92 / 100 / 100 / 99.82 / 99.87 / 99.88 / 99.98 / 99.82 / 99.79 / 99.80 / 99.74 % for 2016–2026.
- **Snap completeness:** with 11 players on the field, `sum(offense_pct)` per team-game has a median of 11.00 and a 1st percentile of 10.98, and `sum(offense_snaps)` = 11 × team snaps (1st–99th percentile exactly 1.000). Below 10.5: 2 offensive and 5 defensive team-games in 11 seasons.
- **Team offensive snaps:** 5,691 of 5,710 team-games have a 100% player.
- **Download errors in nflreadpy 0.1.5:** a missing file raises `ConnectionError` whose `__cause__` is a `requests.HTTPError` with status 404. A timeout's cause is `requests.Timeout`; a DNS failure's is `requests.ConnectionError`. A file that can't be parsed raises `ValueError`.
- **Our cron (09:30 UTC) runs after every source's build:** about 15 minutes after stats; runs are never early, only late (O12).

**Assumptions** (checked at the step named):
- field names and keys stay stable within nflreadpy 0.1.x (every load);
- a current-season file may not exist for a few days after the season rolls over (handled by P2-D10, whatever happens);
- how Neon's console "storage" counts branches and restore history (2.1 console read; 2.7 pilot).

**Unresolved questions:**
- **Q1:** does nflverse publish an empty file before week 1, or none at all? (September 2027.)
- **Q2:** how much restore history (WAL) a large load adds (2.7 pilot).
- **Q3:** PFR's terms for our use (P2-D13, 2.1).

---

## 3. Decisions

**Approval required:** P2-D1, D2, D3, D4, D8, D9, D11. **P2-D13** is approved only as an investigation and a checkpoint; the rights decision itself is Rob's, at the end of 2.1. **Recommended mechanisms**, approved with the plan: D5–D7, D10, D12. Each is recorded in `decisions.md` when its step lands.

### P2-D1 — Pending, partial and failed snap data (2.5) — **approval required**
- **Problem:**
  - Gate D and 2.5 need late snaps shown as pending, never as zero or as a failure.
  - The site can't tell "did not play" from "data missing" unless missing and partial team-games are told apart.
  - `source_loads.status` allows only `success` and `failed`, which the CHECK, `data_freshness`'s test and `last_success` depend on.
- **Recommendation (A1, additive):**
  - **Status stays `success`/`failed`.**
  - Add three nullable integer columns to `raw.source_loads`:
    - **`rows_skipped`:** rows a loader dropped on purpose (placeholders, blank IDs, trimmed positions);
    - **`pending_team_games`:** finished team-games (schedules' `home_score` not null) in the loaded seasons with **no rows** from this source (stats and snaps);
    - **`incomplete_team_games`** (snaps only): finished team-games whose rows exist but fail the **11-player test**, `sum(offense_pct) < 10.5` or `sum(defense_pct) < 10.5`. That is a regular player missing; normal rounding stays within ±0.1. 2.1 lists the few historical failures as known and final.
  - NULL means "not applicable" or "the check didn't run".
- **What each state means downstream** (Phase 3 builds on this):

  | Team-game state | What a player's absence means | Status |
  | --- | --- | --- |
  | Complete (rows pass the 11-player test) | **Zero participation**: did not play (or special teams only), from his snaps and stats | `success` |
  | Pending (no rows) or incomplete (partial rows) | **Not evidence**: the player-week is pending, never 0, never did-not-play | `success`; the count is recorded |
  | The load failed (download, a refused upsert) | Nothing changed in raw; the previous state stands, so missing team-games stay pending | `failed`, with the error |

- **Lateness:** judged by checks (2.6), not by the record. A pending or incomplete current-season team-game more than 3 days old fails the nightly's player-check step, and never blocks publishing (P2-D8). The run's own status is unaffected by pending counts.
- **The site** (R5): `web_reader` can read only `marts`, so any future pending indicator must come through a mart: Phase 3's participation states, or columns added to `data_freshness` in Phase 5. A site query never reads raw. Phase 2 adds no site query; the columns serve operations until then.
- **Production:** the columns reach Neon as an approved expand (backup first) **before** the 2.5 push, because `ensure_tables` would otherwise apply them by itself at 09:30.
- **Rejected:**
  - A2, a new status value: it widens a production constraint and needs `data_freshness`'s test and `last_success` changed in the same expand;
  - A3, nothing recorded: it misses 2.5's Done-when.

### P2-D2 — When player stats become required — **approval required; amends a decision's timing**
- **Problem:** `decisions.md` (2026-10-21, "Freshness and partial failure") says required sources "(schedules, player stats) gate dbt", with no date, but the code has `{"schedules"}`. No mart reads player stats until step 3.3.
- **B1 vs B2:**

  | | B1: required from 2.7 | **B2: required from 3.3 (recommended)** |
  | --- | --- | --- |
  | A stats outage in Phase 2 | Exit 2, no publish: **team pages go stale** for a source no published mart reads | Exit 1: a red run that still publishes; team pages stay fresh; the player tables keep their last good copy |
  | What it protects in Phase 2 | Nothing published (no player marts exist) | The same |
  | Player checks in Phase 2 | In the publish gate, so a player-data defect also blocks team data | In their own nightly step **after the refresh** (P2-D8): they turn the run red but never block the publish or the cache refresh |
  | From 3.3 | Same | `REQUIRED` gains `player_stats`, and the blocking player checks join the publish gate, when `fct_player_games` first depends on them |

- **Why B2:** it keeps Phase 1's reliability for the live team research site through Phase 2. It gives the same guarantee as B1 from the moment a mart needs it. Failures stay visible either way: a red run and the run records.
- **Does it change an authoritative decision?** Yes, its **timing only**. A dated amendment to "Freshness and partial failure" says player stats gate dbt from step 3.3. A one-line task is added to the build plan's 3.3 ("player stats join `REQUIRED`; the blocking player checks join the publish gate"), and Phase 3's plan must include it. The end state is unchanged.
- **Unchanged:** players, rosters and snap counts stay optional (exit 1), and snaps stay late-tolerant.

### P2-D3 — Weekly roster trims (2.1 confirms) — **approval required**
- **The options:**

  | Option | Rows | Size | Lost |
  | --- | --- | --- | --- |
  | **QB/RB/WR/TE by roster position, 13 columns (recommended)** | 151,247 | about 26 MB | 125 REG skill stats rows (0.21%) and 4 snap appearances by players listed elsewhere. Phase 3's spine unions them in from `fct_player_games` |
  | All positions, 13 columns | 483,752 | about 83 MB | Nothing; +57 MB |

- **Why the recommendation:** it matters for the storage projection (P2-D4); widening later only adds rows. Fullbacks are listed as RB.
- **Columns:** `season`, `week`, `game_type`, `team`, `gsis_id`, `full_name`, `position`, `depth_chart_position`, `status`, `status_description_abbr`, `pfr_id`, `years_exp`, `rookie_year`.

### P2-D4 — Storage: Phase 2 go / no-go, and the full-MVP reassessment — **approval required; amends the 2.1 stop rule**
- **What this does and doesn't settle** (R1):
  - Phase 2 can be completed safely under the 700 MB threshold: my estimate for the end of Phase 2 is about **435–515 MB** on the console figure, with the recommended trims.
  - That **does not resolve the full MVP**, projected at about **575–790 MB**, which **may pass 700 MB**. The cause is mainly the candidate copy of every player mart, plus pessimistic key sizes (§7). Passing Gate A means only that the raw player layer fits.
- **The build plan's rule** ("Step 2.1 stops the plan if the projected total exceeds 700 MB") is replaced by these explicit criteria, so the full-MVP limit is moved and enforced, not dropped.

  | Point | Criterion | If it fails |
  | --- | --- | --- |
  | **G1, end of 2.1** | (a) Gate A projection, the high estimate on the console figure, < 700 MB; **and** (b) the full-MVP **low** estimate < 700 MB (a fit is still possible) | Stop before 2.2; hand Rob the mitigations |
  | **G2, the 2.7 pilot** (one season on Neon) | The measured growth (pg size, console storage and history), extrapolated to 2016–2026, keeps the Gate A projection < 700 MB | Stop the production load; re-plan it (spread over days, tighter trims) |
  | **G3, Gate A** | Measured console storage < 700 MB, recorded with its headroom to 1 GB | Gate A fails |
  | **C1, a mandatory capacity reassessment** before step 3.3 creates the first player mart, repeated before 3.7's production build with measured local mart sizes | A `decisions.md` entry with measured Neon storage, the planned or measured mart sizes, and a full-MVP projection **< 700 MB with the mitigations chosen** | Phase 3 doesn't build player marts until Rob has chosen mitigations |

- **Mitigations for C1** (identified, not implemented):

  | Mitigation | Saves | Trade-off |
  | --- | --- | --- |
  | M1: drop the candidate schemas after a successful publish | The at-rest copy of every mart (18 MB now; about 100–200 MB with player marts) | The peak during a publish is unchanged; yesterday's candidate can't be inspected; `candidate_schemas_unreadable.sql` adapts. A small change to `publish.py` |
  | M2: lean player marts (views for the cheap ones; no column a page doesn't use) | Part of 50–150 MB | Query time against 3.7's 100 ms target; must keep "marts store sums" |
  | M3: compact keys (load in key order; one `REINDEX` after the full load) | Up to about 40% of key size (about 20–30 MB on the player tables) | None functional; a one-off approved table lock |
  | M4: tighter raw trims (P2-D3/D5 are already applied; drop snap name and PFR game ID) | About 5–10 MB | Small; less source context |
  | M5: branch hygiene (reset `nightly-test` after rehearsals; review `foundation` at Gate D) | 20–80 MB (bounded by 214 MB for `foundation`) | Losing the oldest restore point, so a newer one must exist first |
  | M6: trim `raw.pbp` (e.g. its `desc` text) | About 30–50 MB | Changes a Phase 0 table (not additive); needs Rob |
  | M7: a paid Neon plan | — | Costs money; requirements §0.5 need Rob's consent |

### P2-D5 — Player-stats columns (2.1 confirms) — recommended
- **Keep 52 of 150 (about 59 MB):**
  - keys and context (11);
  - passing (15), rushing (8), receiving (11);
  - `target_share` and `air_yards_share` (as checks for 3.3);
  - `special_teams_tds`, `fumbles_total`, `fumbles_lost_total`;
  - `fantasy_points` and `fantasy_points_ppr`.
- **Drop:**
  - big-play buckets;
  - `def_*`, kicking, punting and returns;
  - penalties, `misc_yards` and fumble recoveries;
  - `headshot_url`;
  - `pacr`, `racr` and `wopr`.
- **All 150 columns instead:** about 119 MB.

### P2-D6 — The nightly time budget — recommended, no change
- **The 45-minute limit stays.** The estimate after 2.7 is about 3–3.5 minutes:
  - **ingest:** +15–35 s (downloads of 0.1–1 s each; current-season upserts of 7k–27k rows, plus 25k players);
  - **the player-check step:** +5–15 s;
  - **dbt:** unchanged.
- **Headroom:** more than 10 times, even on a 15-minute Open-Meteo night (O10).
- **Measured** at 2.7.

### P2-D7 — The nightly table list is separate from the load order — recommended
- **The change:**
  - `TABLES` stays the full load order: schedules, teams, weather, pbp, players, player_stats, rosters, snap_counts;
  - a new `DEFAULT_TABLES` is `--only`'s default, the four foundation tables until 2.7.
- **A unit test pins it.**
- **CLI names and raw tables:**
  - `players` → `raw.players`;
  - `player_stats` → `raw.player_stats_weekly`;
  - `rosters` → `raw.rosters_weekly`;
  - `snap_counts` → `raw.snap_counts`.

### P2-D8 — Player checks in their own file and nightly step, after the refresh — **approval required** (changes the nightly's Result; R8)
- **The file:** `pipeline/tests/test_player_data.py`, not `test_raw_data.py`. The gate, the advisory step and CI's ignore list are file-scoped, so the player checks can't affect production until 2.7 adds them deliberately. (The file name is a recorded deviation from the build plan's wording.)
- **The existing `nightly.yml`** (read 2026-10-23), in order:
  1. refuse simulations on production;
  2. secret check, checkout, setup;
  3. target check;
  4. restore the weather cache;
  5. mart identities before;
  6. **Ingest** (`code`);
  7. **Publish** (`code`; skipped on ingest 2);
  8. **Publish decision** (`published`);
  9. **Refresh the site** (`code`; production only, `if: published == 'true'`);
  10. Advisory raw checks (warnings only);
  11. mart identities after, and the run records;
  12. save the weather cache;
  13. **Result**: red if ingest ≠ 0, publish ≠ 0, or (production) refresh ≠ 0.
- **The 2.7 changes to it** (made in 2.7, not now):
  - **A new step, "Player data checks"**, inserted **after "Refresh the site"** and before the advisory step, so it can't delay, skip or change the publish or the refresh:
    ```yaml
    - name: Player data checks
      id: player_checks
      if: always() && steps.ingest.outputs.code != ''
      run: |
        set +e
        uv run pytest pipeline/tests/test_player_data.py -m "not advisory" -q -p no:cacheprovider
        echo "code=$?" >> "$GITHUB_OUTPUT"
    ```
    `set +e` and the captured code mean the step itself never fails, so no later step is skipped. No existing step's `if:` refers to it, so the publish decision and the refresh are unchanged. It runs whenever ingest ran, even after a failed publish (it only reads raw).
  - **The advisory step** also runs `test_player_data.py -m advisory` (warnings, never failing).
  - **Result:** adds `player checks` to the summary table, and `[ "$player" = "0" ] || failed=1`. Any non-zero code turns the run red, including pytest's 5 ("no tests collected"), so a missing file can't pass silently.
  - **`simulate_failure` gains `player_checks`** (test target only: the existing first step already refuses any simulation on production). The new step then sets `SIMULATE_PLAYER_CHECK_FAILURE=1` for pytest, which makes one switchable test in `test_player_data.py` fail, the same pattern as dbt's `simulated_failure` test. The variable is set only inside that step.
- **The resulting outcomes in Phase 2:**

  | Ingest | Publish | Refresh (production) | Player checks | Run | Site |
  | --- | --- | --- | --- | --- | --- |
  | 0 | 0 | 0 | 0 | green | published and refreshed |
  | 0 | 0 | 0 | ≠ 0 | **red** | **published and refreshed** |
  | 1 (e.g. a player load failed) | 0 | 0 | any | red | published and refreshed |
  | 0 or 1 | 1, 4 or 5 | not run | any | red | unchanged (as today) |
  | 2 | not run | not run | runs (diagnostic) | red | unchanged (as today) |

- **Rehearsals proving it** (2.7):
  - **Test target:** `gh workflow run nightly.yml --ref <branch> -f target=test -f simulate_failure=player_checks`. Expected: ingest 0; publish 0 with the test branch's marts replaced (new OIDs in "mart identities after"); the player-check step's code non-zero; Result red; the summary shows publish 0 and player checks ≠ 0. The refresh step is skipped there because it's production-only, as today.
  - **Local** (the refresh is shown here):
    1. `ingest`;
    2. `publish`;
    3. `pipeline refresh --expect-stamp` against a local `next start`;
    4. `SIMULATE_PLAYER_CHECK_FAILURE=1 uv run pytest pipeline/tests/test_player_data.py`.

    Expected: the stamp advances on every page, and the player checks fail afterwards with the pages unaffected.
  - **The workflow logic itself:** a reviewed diff showing the new step comes after "Refresh the site", and that no `if:` refers to it. No failure is ever simulated on production; the first production dispatch is expected green.
- **From 2.7 to 3.3** (with P2-D2's B2), the "Player data checks" step runs these:
  - **run-failing** (the run turns red; publishing is never blocked):
    - keys, orphans and team/opponent;
    - stat ranges, season types and weeks;
    - stats IDs in players;
    - mapping ≥ 99.5% for completed seasons;
    - stats freshness at 3 days;
    - snaps freshness at 3 days (pending or incomplete current-season team-games);
  - **advisory** (a warning only):
    - the current season's mapping;
    - rosters having the current week;
    - multi-team roster rows outside the known list;
    - current-season skill roster IDs not in players;
    - any delete in a completed season.
- **At 3.3:** the run-failing checks that protect marts move into the publish gate. Snaps freshness stays non-blocking (late-tolerant).

### P2-D9 — Delete protection (2.2) — **approval required** (new safeguard; R2)
- **Why the first proposal was wrong:** max(50 rows, 1%) would have let whole units through silently:

  | Unit a partial file would drop | Rows (min–max, median) | Season size after week 1 / at the end | max(50, 1%) |
  | --- | --- | --- | --- |
  | Stats team-game | 24–42 (33) | 1,117 / 19,400 | 50 / 194: **a whole team-game passes** |
  | Snaps team-game | 34–49 (46) | 1,492 / 26,613 | 50 / 266: **passes** |
  | Skill roster team-week | 13–45 (26) | 921 / 14,348 | 50 / 143: **passes** |

- **What legitimate corrections look like:**
  - **Observed:** 0 rows deleted in every local run record (43 loads) and in every production run recorded in `decisions.md`.
  - **Releases:** rosters keep released players as rows (97,353 `CUT`/`RES` rows) rather than removing them.
  - **The largest legitimate shape:** one player's whole season (a stats correction or an ID fix), at most 21 rows for stats and snaps and 22 for rosters.
  - **Truncation:** a truncated parquet file can't be read (its footer is at the end), so it fails at download (`ValueError`). A "partial file" is therefore a complete file built from incomplete inputs, which drops **whole team-games or weeks**.
- **Recommendation (two layers, opt-in for the three season-scoped player loaders):**
  1. **Structural, at every season size:** refuse if any unit that has rows in raw would lose all of them. The unit is the team-game `(game_id, team)` for stats and snaps, and the team-week `(season, week, team)` for rosters. A played game never legitimately loses all its stats or snaps.
  2. **Volume:** refuse if more than **25 rows** would be deleted from one season in one load. That's one player's season plus margin; an absolute limit doesn't loosen as the season grows.
  3. **Never silent:**
     - every delete is counted in `rows_deleted` and the nightly summary;
     - an advisory check flags any delete in a completed season (only manual loads touch those).
- **A refusal:**
  - rolls the whole upsert back, so the table is unchanged;
  - records `failed`, listing the units and counts;
  - turns the run red (exit 1 in Phase 2).
- **Override:** `--allow-large-deletes`, by hand only, after reading the listing, with Rob's approval; refused for the nightly's trigger.
- **The existing loaders** (schedules, weather, pbp) are unchanged. Extending the protection to pbp goes in the parking lot.

### P2-D10 — Missing files and transient failures (2.3) — recommended (R3)
- **Verified:** nflreadpy 0.1.5 exposes the HTTP status (§2). A unit test pins that chain through the real downloader with a mocked session, so a future upgrade that changes it fails loudly.
- **Fallback, if it ever does change** (no new dependency, same architecture): our helper sends a HEAD request to the same release-asset URL and reads the status itself.
- **The rules** (`pipeline/nflverse.py`, used by the four player loaders):

  | Case | Outcome |
  | --- | --- |
  | 404 or an empty file, for the **current** season, which has **no rows in raw**, and **no game of it kicked off more than 72 h ago** | **Not yet published:** `success`, nothing written, pending counts recorded, a warning |
  | The same, but a game kicked off more than 72 h ago | **Overdue:** a failure ("no <source> file for season N; k finished games older than 3 days"). Exit 1 in Phase 2; exit 2 for stats from 3.3 (P2-D2) |
  | 404 for a season that already has rows, or for any past season | **Transient** (nflverse replaces assets on upload): retried, then a failure. Never "not published" |
  | Timeout, connection error, 5xx, or a file that can't be parsed | Retried 3 times (waits of 5, 10 and 20 s), then a failure |
  | Any other 4xx | A failure, with no retry |

- **One lateness rule:** the 72 h is the same 3 days `test_finished_games_have_pbp` and the stats freshness check use.

### P2-D11 — Data anomalies and corrections — **approval required**
- **Placeholder rows** (X1): dropped and counted.
- **Null or blank roster IDs** (X4): dropped and counted.
- **The 2019 ID collision** (X3): kept as published (raw is as-is; the key is unique) and documented; an advisory check catches any new multi-team player-week.
- **Roster IDs not in players** (X6): kept and counted.
- **No value is corrected anywhere.**

### P2-D12 — Neon branches, the pilot and historical rebuilds — recommended
- **Pilot:** the 2.7 load starts with one season (2025) of all four tables (G2).
- **`nightly-test`:** it isn't given a full history. After the production load, Rob resets it from its parent, and the 2.7 code is rehearsed there from a branch (O7 allows it).
- **Historical rebuilds** (X16): go into the parking lot and 5.10's preseason runbook ("reload every player table each August").

### P2-D13 — Snap-count data rights: an investigation and a checkpoint, not a choice — **decided by Rob at the end of 2.1** (R6, R7)
- **Approving this plan authorises no use of PFR-derived snap counts.** It approves only the investigation in 2.1, the decision checkpoint, and the rule that **step 2.5 can't start until the checkpoint is passed**. No option is pre-selected. A recommendation is made at the checkpoint, from the evidence 2.1 gathers.
- **Until the checkpoint is passed:**
  - no snap-count data is loaded into any database, local or Neon;
  - no snap-derived value is designed into a page;
  - the only exception: 2.1's audit (requirements §5.2) reads snap counts **in memory** to measure aggregate coverage, and the committed notebook and audit show **aggregate counts only**, never player-level snap rows. Rob approves this exception with the plan, or says no, and 2.1 then skips the snap measurements.
- **Why the two documents must be read together.** Neither settles the question alone:
  - **nflverse's CC BY 4.0 statement** (the nflverse-data repository licence) licenses what nflverse holds rights to. A CC BY licence grants no rights the licensor doesn't have, and it doesn't override a third party's terms. So it can't be assumed to cover data nflverse collected from PFR.
  - **Sports Reference's terms** are its own conditions for using its sites and data. Its data-use page (read on 2026-10-23) bars, without express permission:
    - building websites or tools on data scraped from its sites;
    - databases that compete with or substitute for its own;
    - AI use.

    It also says facts aren't copyrightable, and it doesn't address free non-commercial display, attribution or data received through a third party.
  - **Not assumed to remove the concern:** attribution, internal-only use, and showing only derived values (snap share, participation states). Each is a fact to weigh, not a resolution.
- **2.1's investigation** (a reading of terms and statements, recorded with the dates read; not legal advice):
  1. SR's Terms of Use (clause 5) and "Acceptable Use of Sports Reference Data", in full.
  2. nflverse's own statements on snap counts: the `nflverse-pfr` repository's README and licence, the `load_snap_counts` documentation, and any stated arrangement with Sports Reference.
  3. Exactly what the MVP would store and show from snap counts, and where (raw, marts, pages).
  4. A short, factual permission request for Rob to send himself if he wants, describing the project and the intended use. Claude drafts it; sending it is Rob's action.
- **The checkpoint: before step 2.5, one of these must be recorded in `decisions.md`, with its evidence:**

  | Outcome | What must exist | Then |
  | --- | --- | --- |
  | **R-a: an adequately supported right** | A documented basis that covers our intended use, reviewed and accepted by Rob: SR's terms, read in full, plainly allowing it; or a licence or arrangement through nflverse that clearly extends to downstream users | 2.5 as planned, within that basis |
  | **R-b: permission** | Written permission from Sports Reference covering the intended use | 2.5 as planned, within the permission's terms |
  | **R-c: an approved fallback** | Rob approves requirements §9 fallback 1: no snap counts loaded; no snap share; a player without a stats row shown as unknown, never did-not-play (12.6% of appearances lose that answer) | 2.5 becomes "document the fallback". 2.6 and 2.7 go ahead without snap counts. The snap-dependent parts are amended through `decisions.md`, with Rob's approval: Gate A's snap item, the "Snap counts are required" decision, and steps 3.3–3.5. No other in-season source covers zero-stat appearances (participation data is published only after the postseason) |

- **If none is in place when 2.4 is done:** Phase 2 pauses at 2.5 (2.6 and 2.7 depend on it). Rob may choose R-c as an interim fallback, which can be reversed later by loading snaps once R-a or R-b exists.

---

## 4. Sequencing and dependencies

The order 2.1 → 2.7 is unchanged.

| Step | Needs | Why |
| --- | --- | --- |
| 2.1 | Plan approved | Columns, trims, types; G1; the P2-D13 review |
| 2.2 | 2.1 (G1 passed) | Type maps; guards for every later load |
| 2.3 | 2.2 | Guards, `whole_numbers`, P2-D7, P2-D10 |
| 2.4 | 2.3 | The players-coverage check reads stats |
| 2.5 | 2.4, **and the P2-D13 checkpoint passed** (R-a, R-b or R-c recorded) | The mapping gate reads `raw.players.pfr_id`; the run-record columns: **Neon expand before the push**. Under R-c, 2.5 documents the fallback instead |
| 2.6 | 2.5 | Checks all four tables, with break tests |
| 2.7 | 2.6 | Production load (G2), then the nightly (expand → deploy) |

**Carried forward, written into the build plan's 3.3 and Phase 3's plan:**
- C1, before the first player mart;
- `REQUIRED` gains `player_stats`, and the player checks join the gate (P2-D2).

## 5. Working conventions (as Phase 1)

- **Explaining:** 2–4 sentences before code. A clause-by-clause walkthrough after 2.1, 2.5 and 2.6.
- **Commits:** one per step (`2.x: …`), the tick in the same commit, or `2.x: record checks` when evidence comes after the push (2.5, 2.7).
- **Regression set:** ruff, pytest, local `dbt build` (stays PASS=338 through Phase 2), plus the web checks only if web files change (none planned).
- **Failures:**
  - blocking: fixed in the step;
  - non-blocking: the parking lot;
  - environmental: recorded;
  - the same error twice: hand back.
- **Production:** each Neon command is announced and approved, with `backup_schema --verify` before any schema change. Deliberate failures run only locally or on `nightly-test`. Secrets are set from Python and never printed.

---

## 6. Steps

### Step 2.1 — Source audit, column choice and data rights
1. **Objective:** reproduce §2 in a notebook that re-runs headless; the column, trim and type choices; the storage projection with G1; the §5.2 audit document; the PFR rights investigation for P2-D13's checkpoint.
2. **Reuse:**
   - `nflverse_to_pandas`;
   - this session's probe logic;
   - `pipeline/analysis.py` (`chart_style`, `save_figure`);
   - the size estimator (§7).
3. **Files:**
   - new `notebooks/07_player_sources.ipynb` and `docs/fantasy-source-audit.md`;
   - `docs/figures/player_source_coverage.png`;
   - `docs/decisions.md`: columns, trims, types, anomalies, projection, G1, the 11-player threshold, P2-D13's options;
   - `docs/build-plan.md`:
     - the Data sources table re-verified (X1–X8);
     - the storage table;
     - the terminology below;
     - the tick.
4. **Database:** none (nflreadpy and GitHub's public API only).
5. **Tasks:**
   1. **Per source:**
      - schema and dtypes;
      - rows per season and type;
      - keys after the documented drops;
      - null and blank IDs;
      - ID mappings;
      - team codes against the schedule;
      - current-season coverage;
      - columns null by season;
      - integer maximums (do they fit `smallint`?);
      - release upload times.
   2. **Measurements and anomalies:**
      - the scoring identity (0 / 194 / 432);
      - zero-stat appearances;
      - team snaps recoverable;
      - the **11-player test**: distribution, threshold and the list of known incomplete team-games;
      - the delete-pattern table (P2-D9);
      - X1–X6 listed by row.
   3. **Choices:** the column lists and the explicit type map per table.
   4. **Storage:** Rob reads the console's storage and history (read-only, click-by-click), and the notebook projects Gate A and the full MVP against **G1**.
   5. **The audit document:** §5.2's eight items per source, the weekly-stats-versus-play-by-play statement, and the licences.
      - **The terminology** (R6): each source gets two separate attributes:
        - its **MVP dependency** (§5.2 item 8: required / optional / not feasible);
        - its **nightly failure policy** (blocks publishing / doesn't).
      - **Snap counts:** *required for the MVP* (with the mapping gate), *late-tolerant* in the nightly (never blocks publishing).
      - **Player stats:** required, blocking from 3.3.
      - **Players and rosters:** required, non-blocking.
      - The build plan's Data sources "Role" column and Gate A's snap item use these words.
   6. **Rights investigation (P2-D13):**
      - the four items of P2-D13's investigation, with the dates read;
      - the evidence summarised in the audit document;
      - a recommendation among R-a, R-b and R-c, made from that evidence;
      - the draft permission request.

      Snap counts are read in memory for aggregate coverage only, if Rob approved that exception; otherwise the snap measurements are skipped and the mapping-gate assert moves to 2.5.
6. **Asserts (the Done-when):**
   - 0 duplicate keys;
   - scoring identity 0;
   - mapping ≥ 99.5% in every season 2016–2026;
   - placeholders have 0 offensive volume;
   - the 2 null-opponent rows are placeholders;
   - multi-team roster rows ⊆ the known collision;
   - G1 (a) and (b).

   Counts are dated; the asserts are invariants.
7. **Risks:** nflverse changes a file mid-step (re-run); the notebook isn't a CI check (it downloads), as with 02–06.
8. **Approvals:**
   - the console read;
   - P2-D3 and P2-D5 confirmed if the counts move;
   - **the P2-D13 checkpoint:** Rob records R-a, R-b or R-c (or that it's still open), and 2.5 can't start until one is recorded.
9. **Done-when** (build plan, with P2-D4): the asserts pass, the audit (rights investigation included) is complete, and G1 passes. The rights *decision* isn't part of 2.1's Done-when; it's 2.5's precondition.
10. **Commit:** `2.1: player source audit`, then the walkthrough.

### Step 2.2 — Harden the upsert
1. **Objective:** `upsert_dataframe` refuses bad input before writing, with counts and the first 5 examples. Explicit types. P2-D9's delete protection.
2. **Files:**
   - `pipeline/db.py`:
     - the guards; `types=`; `protect_units=`; `max_deletes=`;
     - `whole_numbers(df, {col: dtype})`, generalised from `compact()`;
   - `pipeline/load_pbp.py`: `whole_numbers`, same behaviour;
   - `pipeline/tests/test_upsert.py`: skip evaluated at run time;
   - the other `local_only` modules if affected;
   - `docs/data-model.md` "Conventions"; `decisions.md`; build plan.
3. **Behaviour:**
   - **Refused before any write:**
     - duplicate keys;
     - null keys (per key column);
     - `scope_col` without `scope_values`, or missing from the frame.
   - **With `types`:**
     - the frame and the map must have the same columns;
     - the frame is cast before COPY, refusing non-whole or overflowing values;
     - CREATE and ADD COLUMN use the map;
     - a column whose type differs from the map is refused (drift).
   - **With `protect_units` and `max_deletes`:** inside the transaction, before the DELETE, compute the units that would lose every row, and the season's delete count. Refuse with a listing and roll back.
   - **Existing loaders** pass none of these, so their behaviour is unchanged.
4. **Tests** (`local_only`, throwaway schemas):
   - each input guard;
   - the type map (exact types, drift refused, non-whole refused);
   - **partial source files:**
     - **(a) week 1 (small season):** a file missing one team-game is refused;
     - **(b) late season:** a file missing a whole week is refused;
     - **(c) scattered:** 30 rows missing across games are refused, in both a small and a large season;
     - **(d) legitimate:** one corrected row is deleted and counted; one player's season (21 rows) is deleted;
     - **(e)** the override passes;
     - **(f)** in every refusal, the table is byte-for-byte unchanged (row count, and `max(_loaded_at)`);
   - collection with `DATABASE_URL` unset.
   - **Each new test fails with its guard removed:** shown locally and recorded, not committed.
5. **Checks:** a local reload of every existing table (`ingest --full --only schedules,teams,weather,pbp`, weather cached) gives 0 changes; `dbt build` PASS=338; CI green.
6. **Risks:** a guard refusing existing data, caught by the full reload before the push. No production change.
7. **Done-when** (build plan): the new tests pass, each fails without its guard, and existing reruns change nothing.
8. **Commit:** `2.2: harden the upsert`.

### Step 2.3 — Weekly player stats
1. **Objective:** `raw.player_stats_weekly`, 2016+, key `(player_id, game_id)`, scoped by season, every player with an ID.
2. **Files:**
   - new `pipeline/load_player_stats.py`;
   - new `pipeline/nflverse.py` (P2-D10's rules and retry);
   - `pipeline/__main__.py`: `TABLES`, `DEFAULT_TABLES`, `RAW_TABLE`, `default_loaders`;
   - new `pipeline/tests/test_player_loaders.py` (pure, in CI):
     - the placeholder drop, columns and types;
     - **every P2-D10 case**, with fake errors and clocks;
     - the pinned nflreadpy error chain;
   - `test_runs.py`: the default excludes player tables;
   - `docs/data-model.md`, `CLAUDE.md`, `decisions.md`, build plan.
3. **Database (local):**
   - the table with 2.1's types, its key and `_loaded_at`;
   - no extra index (Phase 3 reads it whole; the season delete scans about 19k rows).
4. **Tasks:**
   - **The loader**, one season per transaction:
     - download (P2-D10);
     - drop null or blank IDs (counted);
     - columns and cast;
     - upsert with `scope_col="season"`, `protect_units=["game_id","team"]` and `max_deletes=25`.
   - **Local runs:** `ingest --full --only player_stats`, then the rerun and the hand-edited row.
5. **Checks (local):**
   - rows per season = source − placeholders;
   - the rerun +0 ~0 −0;
   - the edit restored;
   - 0 duplicates;
   - the regression set.
6. **Risks:**
   - **Production:** untouched (P2-D7's test). The next scheduled run's records still show four tables (noted in 2.4).
   - **A file built mid-game** (a stale nflverse build): the next night's upsert corrects it, and 3.x's agreement test catches anything lasting.
7. **Done-when** (build plan): source − placeholders per season; the rerun changes nothing; the edited row is restored; 0 duplicates.
8. **Commit:** `2.3: load weekly player stats`.

### Step 2.4 — Players and weekly rosters
1. **Objective:**
   - `raw.players`: key `gsis_id`, upsert-only, about 23 columns;
   - `raw.rosters_weekly`: key `(season, week, gsis_id, team)`, scoped by season, P2-D3's trim, `protect_units=["season","week","team"]`, `max_deletes=25`.
2. **Files:**
   - new `pipeline/load_players.py` and `pipeline/load_rosters.py`;
   - `__main__.py`; `test_player_loaders.py`; `test_runs.py`;
   - docs.
3. **Checks (local):**
   - every stats `player_id` is in `raw.players` (exceptions listed by name and ID);
   - the key is unique;
   - a mid-week trade fixture keeps one row per team (X3: no real example in 2016–2026);
   - roster orphans are counted against X6;
   - the reruns are +0 ~0 −0;
   - the regression set.
4. **Done-when** (reworded for X3, to approve): every stats `player_id` is in `raw.players`; the key is unique and a trade fixture keeps one row per team; a second run changes nothing.
5. **Commit:** `2.4: load players and weekly rosters`.

### Step 2.5 — Snap counts, pending and partial team-games, the mapping gate
1. **Objective:**
   - `raw.snap_counts`: key `(game_id, pfr_player_id)`, scoped by season, `protect_units=["game_id","team"]`, `max_deletes=25`;
   - P2-D1's three columns;
   - the ≥ 99.5% mapping gate in every season.

   **Precondition:** P2-D13's checkpoint recorded as R-a or R-b. Under R-c this step instead documents the fallback, with no snap loader and no mapping gate, and amends the snap-dependent items with Rob's approval. With nothing recorded, the step doesn't start.
2. **Files:**
   - new `pipeline/load_snap_counts.py` and `pipeline/coverage.py`:
     - `team_game_coverage(seasons, frame)`: finished team-games from `raw.schedules` → pending / incomplete / complete;
     - the 11-player test;
   - `pipeline/sql/run_records.sql` (three `ADD COLUMN IF NOT EXISTS`);
   - `pipeline/runs.py` and `pipeline/db.py` (results carry `skipped`, `pending`, `incomplete`);
   - `pipeline/__main__.py` (`combine`; `--simulate-snap-delay`, local or test only);
   - `pipeline/load_player_stats.py` (pending);
   - new `pipeline/sql/checks/snap_mapping_coverage.sql`;
   - new `pipeline/tests/test_player_data.py`;
   - `ci.yml` (ignore it);
   - `pipeline/report.py`, `latest_run_loads.sql`;
   - `test_runs.py`; docs.
3. **Database:**
   - **local:** the table and the three columns;
   - **Neon expand (before the push; Rob approves each):**
     1. `backup_schema --verify`;
     2. `ingest --only teams` with `DATABASE_URL` set to Neon: `ensure_tables` adds the columns, and teams reloads normally;
     3. check information_schema and `create_web_reader --check`.
4. **Tests:**
   - **pure:**
     - coverage states (no rows; one team's rows only; a team-game missing a 100% player, which fails the test; complete);
     - the counts reach the record;
   - **`local_only`:**
     - the columns and their NULLs for non-player tables;
     - a team-game with partial rows counted as `incomplete_team_games`, not pending or complete.
5. **Checks (local):**
   - the gate ≥ 99.5% every season;
   - the rerun +0 ~0 −0;
   - **a simulated delay:**
     1. delete the latest week locally;
     2. `ingest --only player_stats,snap_counts --simulate-snap-delay`: stats load, snaps `success` with `pending_team_games` = 2 × that week's finished games;
     3. a normal run clears it;
   - **a regressed source** (the simulation with the week still loaded) is refused by protection, and nothing is deleted;
   - **after the push:** the next nightly is green with NULLs in the new columns for the four foundation tables.
6. **Done-when** (build plan): the gate passes every season; the rerun changes nothing; a simulated missing week loads stats and records the snaps as pending.
7. **Commits:** `2.5: load snap counts`, then `2.5: record checks`.

### Step 2.6 — Player data checks
1. **Objective:** commented SQL checks and tests, each failing when broken on purpose, classified as in P2-D8.
2. **Files:**
   - `pipeline/tests/test_player_data.py`;
   - new SQL checks:
     - `player_stats_team_mismatches.sql`, `snap_team_mismatches.sql`;
     - `player_ids_in_players.sql`, `player_freshness.sql` (stats and snaps, pending and incomplete);
     - `player_stat_ranges.sql`, `roster_multi_team.sql`, `player_season_types.sql`, `completed_season_deletes.sql`;
   - new `pipeline/tests/test_player_checks_break.py` (`local_only`): each SQL against throwaway fixtures without keys;
   - `test_simulated_player_check_failure` in `test_player_data.py`: fails only when `SIMULATE_PLAYER_CHECK_FAILURE=1`, a no-op otherwise. A pure test confirms it passes when the variable is unset;
   - docs, including `CLAUDE.md`'s note on running the player file against Neon.
3. **The residual mismatches:** recorded as X2; nothing to correct.
4. **Done-when** (build plan): every check passes locally, and each fails on its break fixture (at least a duplicate row, an orphan game and a wrong team).
5. **Commit:** `2.6: player data checks`, then the walkthrough.

### Step 2.7 — Load production and extend the nightly job
1. **Objective:** the four tables on Neon (2016+), checked, and loaded nightly, with expand → deploy and every command approved.
2. **Files:**
   - `pipeline/__main__.py`: `DEFAULT_TABLES` gains the player tables; `REQUIRED` unchanged (P2-D2);
   - `nightly.yml`, exactly as specified in P2-D8:
     - the "Player data checks" step after "Refresh the site";
     - the advisory step also runs the player file;
     - Result counts `player_checks`;
     - `simulate_failure` gains `player_checks`;
   - `test_runs.py`; `CLAUDE.md`; `docs/data-model.md`;
   - `decisions.md` (the P2-D2 amendment);
   - the build plan (the 3.3 line, the tick).
3. **Sequence** (stop for Rob before each Neon step):
   1. Pre-checks: the last nightly green, none running; the console read.
   2. `backup_schema --verify`.
   3. **Pilot (G2):** `ingest --seasons 2025 --only players,player_stats,rosters,snap_counts` on Neon; the console read; extrapolate.
   4. `--seasons 2016-2024,2026`, then a current-season rerun (+0 ~0 −0).
   5. Against Neon (read-only):
      - `pytest test_raw_data.py test_player_data.py`;
      - `create_web_reader --check` (raw 0 of 10, marts unchanged);
      - sizes per table.
   6. Rob resets `nightly-test` from its parent.
   7. **The local rehearsal** (P2-D8): ingest, publish, `refresh --expect-stamp` against a local `next start`, then the player checks with `SIMULATE_PLAYER_CHECK_FAILURE=1`. The stamp advances, then the checks fail.
   8. **Test-target rehearsals**, the 2.7 code from a branch (Rob approves each dispatch; only `nightly-test` is written):

      | Dispatch | Expected |
      | --- | --- |
      | `-f target=test` | Green; eight loads recorded; publish 0; player checks 0 |
      | `-f target=test -f simulate_failure=player_checks` | **Red**; ingest 0; publish 0 with the marts replaced (new OIDs); player checks ≠ 0; the summary shows both codes |
      | `-f target=test -f compare=true` | Green; the marts identical to the candidate |

   9. Push to `main`; a manual production dispatch (no simulation): green, eight loads, refresh and `--expect-stamp` pass, player checks 0.
   10. The next scheduled run green → `2.7: record checks`: storage (pg and console, G3), timings, the first night's pending counts, and the rehearsal run links.
4. **Risks and recovery:**
   - **The pilot exceeds expectations:** stop (G2).
   - **A failed load:** idempotent rerun.
   - **A bad table:** drop with approval and reload.
   - **The nightly misbehaves:** revert the 2.7 commit; the cached site keeps serving.
   - **A preview build fails on the branch:** O3, a preview only.
5. **Done-when** (build plan, with G3): the Neon checks pass; storage is measured and recorded under 700 MB on the console figure; the next nightly loads the player tables and records each in `raw.source_loads`.
6. **Commits:** `2.7: load production and extend the nightly job`, then `2.7: record checks`.

---

## 7. Storage and nightly estimates

**The method:**
- Postgres tuple layout: header, null bitmap, alignment, short-text headers, line pointer, 8 kB pages. Its heap estimate for `raw.schedules` was 3.44 MB against 3.47 MB actual.
- Keys use `raw.pbp_pkey`'s measured 69 bytes a row (against the rule's 36), which is pessimistic (M3).
- MB = 10^6 bytes.

| Table (2016–2026) | Rows | Heap | Key | Total |
| --- | --- | --- | --- | --- |
| `raw.player_stats_weekly` (52 columns) | 188,591 | 42.9 MB | 15.9 MB | 58.8 MB (150 columns: 118.9) |
| `raw.snap_counts` (16) | 261,870 | 40.5 | 20.3 | 60.8 |
| `raw.players` (23) | 24,861 | 4.1 | 1.3 | 5.4 |
| `raw.rosters_weekly`, QB/RB/WR/TE (13) | 151,247 | 15.7 | 10.4 | 26.1 (all positions: 82.9) |
| **Phase 2 total** | | | | **151 MB** (all positions: 208) |

| Projection (console figure) | Low | High (recommended trims) | High (all positions) |
| --- | --- | --- | --- |
| Today (pg 234 MB; the console is about 15–35 MB higher; Rob reads it in 2.1) | 250 | 270 | 270 |
| + Phase 2 tables, +10% for updates | +166 | +166 | +229 |
| + branch shares (`foundation` 20–40 now, ≤ 214; `nightly-test` about 40 after a reset) | +20 | +80 | +80 |
| **Gate A (G1, G3)** | **≈ 436** | **≈ 516** | **≈ 579** |
| + player marts with the candidate copy and indexes (40–80 MB ×2, +25%) | +100 | +200 | +200 |
| + projection archive and grades | +40 | +70 | +70 |
| **Full MVP (C1)** | **≈ 576** | **≈ 786** | **≈ 849** |

The high columns stack every pessimistic assumption. 2.1 narrows them with the console reading; C1 replaces the mart line with real sizes.

**Growth:** about 40 MB of raw a season.

**Nightly:** P2-D6, about 3–3.5 minutes against 45.

## 8. Phase 2 / Gate A end-to-end checklist

- [ ] Notebook 07 re-runs headless with its asserts passing; the audit is complete, with the rights investigation and the two-attribute terminology.
- [ ] The P2-D13 checkpoint is recorded in `decisions.md` as R-a or R-b, with its evidence, before any snap data was loaded; or as R-c, with the fallback's amendments approved.
- [ ] G1 passed at 2.1, and G2 at the pilot; G3: console storage measured and under 700 MB, with the full-MVP projection and C1 recorded as open for Phase 3.
- [ ] Locally and on Neon: four tables, per-season rows match the notebook, reruns +0 ~0 −0; the edited row restored (local).
- [ ] `test_player_data.py` passes locally and on Neon; every check fails on its break fixture.
- [ ] Mapping ≥ 99.5% in every season 2016+, locally and on Neon.
- [ ] Snaps:
  - a simulated delay gives `pending_team_games`;
  - a partial team-game gives `incomplete_team_games`;
  - both have status `success`, and the next run clears them;
  - a failed load is `failed` with raw unchanged.
- [ ] Delete protection: the partial-file tests (a)–(f) pass; a regressed source is refused on a real local table.
- [ ] Not-yet-published, overdue and transient download cases behave as in P2-D10 (unit tests; the nflreadpy chain pinned).
- [ ] The nightly:
  - the default includes the player tables;
  - `REQUIRED` = {schedules} until 3.3;
  - the "Player data checks" step comes after "Refresh the site", with its code in Result;
  - `simulate_failure=player_checks` on the test target gave a red run with publish 0 and marts replaced;
  - the local rehearsal showed the refresh and stamp unaffected by a failing player check.
- [ ] The test-target rehearsal, the manual production run and the next scheduled run are green; eight loads in `latest_run_loads.sql`; `data_freshness` lists the player tables.
- [ ] `create_web_reader --check`: marts readable, staging 0, raw 0 of 10, writes refused.
- [ ] Backups before 2.5's and 2.7's schema changes, restore-checked.
- [ ] The regression set; CI green; `dbt build` PASS=338.
- [ ] Docs:
  - `decisions.md` has an entry per step (with the P2-D2 and P2-D4 amendments);
  - boxes ticked;
  - `CLAUDE.md`, `data-model.md` and the build plan updated (Data sources, storage, the 3.3 line, C1);
  - the parking lot updated (X16, M1–M7, pbp delete protection).
- [ ] Phase end: a summary for Rob, plus the checkpoint concepts:
  - GSIS IDs, never names;
  - idempotent loads;
  - how coverage was checked;
  - why snap counts are required for the MVP but never block the nightly;
  - pending vs incomplete vs zero vs failed.

## 9. Risks and open questions

| Risk | Safeguard |
| --- | --- |
| A Phase 2 push changes production early (X10–X12) | P2-D7, P2-D8, expand-before-push in 2.5 and 2.7 |
| A partial file deletes history | P2-D9's structural and volume limits; tests (a)–(f) |
| A late, missing or replaced file | P2-D10 |
| Player data problems make the team site stale | P2-D2 (B2): non-blocking until 3.3 |
| Snaps misread as did-not-play | P2-D1's coverage states; Phase 3 treats pending or incomplete as pending |
| Storage near the limit | P2-D3/D5; G1–G3; C1 with M1–M7 |
| PFR terms | P2-D13: no snap data loaded until R-a, R-b or R-c is recorded; the plan's approval doesn't authorise it |
| A player-check failure stops the team site refreshing | P2-D8: the step runs after the refresh, its code goes only to Result; rehearsed on the test target and locally |
| Past seasons rebuilt (X16) | The preseason reload (5.10 runbook) |
| Source ID errors and orphans (X3, X6) | Documented; advisory checks; never resolved by name |
| Late GitHub schedules (O12) | Unchanged; pending counts show when the data arrived |

**Open:** Q1–Q3. **Process:** O3 for the 2.7 branch rehearsal.

## 10. Effort and session boundaries

| Session | Steps | Estimate | Rob's part |
| --- | --- | --- | --- |
| 1 | 2.1 | 3.5–4.5 h | Console read; confirm D3/D5; **the P2-D13 checkpoint** (can be recorded later, but before 2.5); optionally send the permission request; walkthrough |
| 2 | 2.2 | 2.5–3.5 h | — |
| 3 | 2.3 + 2.4 | 3–4.5 h | — |
| 4 | 2.5 | 3–4 h + 1 night | Backup and Neon expand approvals; walkthrough |
| 5 | 2.6 | 2–3 h | Walkthrough |
| 6 | 2.7 + Gate A | 3.5–4.5 h + 1 night | Each Neon command; console reads; test-branch reset; three test dispatches and one production dispatch |
| **Total** | | **17.5–24 h** (build plan 8–16 h; the extra is the safeguards and the rehearsals). It excludes any wait for Sports Reference's answer | |

## 11. What step 2.1 will do, once authorised

Step 2.1 builds notebook 07, which downloads the four player sources fresh (2016–2026) and proves, with asserts that re-run:
- no duplicate keys;
- the scoring identity;
- the snap mapping ≥ 99.5% in every season;
- the 11-player completeness test, and the known historical exceptions;
- the anomalies X1–X6, each explained.

From those numbers it fixes each loader's columns, trims and exact Postgres types. With Rob's console reading, it projects storage and applies go / no-go G1. It writes `docs/fantasy-source-audit.md`. That includes the PFR rights investigation, weighing nflverse's CC BY 4.0 statement and Sports Reference's terms together, plus a recommendation and a draft permission request, for Rob's checkpoint decision (P2-D13). It loads no snap data, and touches no database, local or Neon.

## 12. Consistency check (revised plan, 2026-10-23)

| Against | Point | Result |
| --- | --- | --- |
| Requirements §0.1 | No destructive production change without approval; backups first | Consistent: the expands are approved, backups come first, and P2-D9 *strengthens* protection |
| §0.3 | No invented data | Pending and incomplete are never shown as 0 or did-not-play (P2-D1) |
| §0.5 | No paid providers | M7 is listed only as Rob's choice |
| §0.6, §5.3 | Licensing checked per dataset; don't assume all nflverse sub-datasets share one licence | P2-D13: nflverse's licence and SR's terms are weighed together; no PFR-derived data is loaded until a right, a permission or a fallback is recorded; the plan's approval authorises none of them |
| §5.2 | The audit table; item 8 required/optional/not feasible | Kept, with the failure policy as a separate attribute (R6), so neither meaning is relaxed |
| §5.4, §9 fallback 1 | Snap coverage or rights failing → fallback | R-c of P2-D13 is exactly fallback 1; the mapping gate stays at 99.5% under R-a or R-b |
| `decisions.md` "Snap counts are required"; Gate A's snap item | Snaps decide played vs did-not-play; the mapping gate | Unchanged unless Rob records R-c, which amends them explicitly (never silently) |
| §6.2 | `source_loads` notes | The three additive columns fit "or existing equivalent" |
| §6.5 | Measure storage before adding tables | G1, G2, G3, C1 |
| §7 Phase 2 | Incremental, idempotent; no deletes on a transient failure; ID resolution not by name; snap gate; checks fail when broken | All covered (2.2–2.6) |
| `decisions.md` "Freshness and partial failure" | Required sources gate dbt | Amended in **timing only** (P2-D2); the end state is unchanged from 3.3 |
| Build plan 2.1 storage rule | Stop above 700 MB | Replaced by explicit G1–G3 plus C1, which keeps the 700 MB limit for the full MVP (P2-D4) |
| Build plan 2.4 and 2.6 wording | "Traded players once per team"; checks in `test_raw_data.py` | Reworded or relocated with the reason (X3, P2-D8) |
| Phase 1 safeguards | Publish gate, candidate build, lock and fingerprint, expand → deploy, no simulation on production, `web_reader` marts only, caching, CI without secrets | Unchanged:<br>- the gate's contents are unchanged until 3.3;<br>- the new raw tables are locked and fingerprinted automatically (`_loaded_at`);<br>- no web or grant change;<br>- CI ignores the new data file |
| Phase 1 refresh rule | Refresh "production only, and only when the marts were published"; "a red run always means something needs looking at" | Kept: the player step runs after the refresh, and no `if:` depends on it. Its failure reaches only Result, so a red run still means something to look at. `player_checks` joins the production refusal of simulations through the existing first step |
| Gate D (5.x) | Simulated critical failure: run red, site not refreshed | Not affected: player checks aren't critical tests until 3.3, and Phase 3's plan revisits them when they join the gate |
| Implementation | `ensure_tables`, the `data_freshness` test, `REQUIRED`, `TABLES` | X10–X14 each have a step that handles them; `data_freshness` is not changed in Phase 2 |

## 13. Revisions after Rob's review (2026-10-23)

- **R1 (P2-D4):** G1–G3 and C1 are explicit; the full MVP is stated as unresolved; mitigations M1–M7 with trade-offs.
- **R2 (P2-D9):** max(50, 1%) rejected on measured unit sizes; a structural per-unit limit plus 25 rows a season; tests (a)–(f).
- **R3 (P2-D10):** the HTTP status was verified in nflreadpy 0.1.5, with a fallback; the not-yet-published, overdue and transient rules.
- **R4 (P2-D2):** B2 recommended (required from 3.3); a timing amendment, not a reversal.
- **R5 (P2-D1):** coverage by team-game: pending / incomplete (the 11-player test) / complete; zero vs pending vs failed; marts only for the site.
- **R6:** the PFR rights review in 2.1 (P2-D13); the required vs late-tolerant terminology; this consistency check.

**Final corrections (2026-10-23, Rob's second review):**
- **R7 (P2-D13):**
  - no option is pre-selected;
  - the plan's approval authorises no use of PFR-derived data;
  - nflverse's licence and SR's terms are weighed together;
  - attribution, internal-only use or derived values are not assumed to resolve it;
  - 2.5 requires R-a (a documented right), R-b (permission) or R-c (an approved fallback);
  - 2.1 reads snaps in memory for aggregates only, if Rob approves that exception.
- **R8 (P2-D8):**
  - the player-check step is placed after "Refresh the site", its exact YAML and exit-code handling are given, and Result includes it;
  - an outcome table;
  - the `player_checks` simulation on the test target and a local rehearsal that includes the refresh.
