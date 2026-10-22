# Parking lot

Ideas for later. Not part of the current step.

## Fantasy features after the MVP

- **Injury report designations.** nflverse's injury feed held 2026 weeks 1–7 on 2026-10-21, but requirements §1.4 leaves injury reporting out of the MVP. Revisit with a freshness gate.
- **Red-zone and route-level roles** from play-by-play player IDs. They need player-ID columns in `raw.pbp` and a full reload.
- **nflverse's expected fantasy points** (`load_ff_opportunity`) as a comparison.
- **Opponent-adjusted context on the pages** (US-11), if step 6.4 shows it helps.
- **Kickers and team defenses.**

## Team research

- **Forecast weather (2026-10-18).** The findings compare totals set on forecasts with the weather that actually happened, so the low over % in rain and wind is partly hindsight. Ideas:
  - Keep each game's last pre-kickoff Open-Meteo forecast (fetches stored, never overwritten), so a later analysis can test whether the market misjudges *forecast* weather.
  - Check whether Open-Meteo keeps an archive of past forecasts for earlier seasons.
  - Show forecast buckets in the situational week view.
- **Situational effects this season vs history, and a weekly situational recap.**
- **Does the home edge change by situation? (2026-10-18).** Game-level situations were compared on scoring only. Whether home field is worth more in divisional games, bad weather or primetime (home margin by game-level value) is a separate question the existing data could answer.
- **An interval for the shrunk win % (2026-10-19).** Team pages show the shrunk estimate with the share from the team's own games, n/(n+k), not an interval.
  - A proper interval needs the uncertainty in the team's overall win %, in the league split and in k itself (rest advantage's k runs from 68 to unbounded).
  - Derive one, check its coverage by simulation against notebook 06's persistence data, then show it.
- **Explorer links from team pages (2026-10-19).** Each team-page situation block could link to the explorer with that situation and team chosen, e.g. "Explore 15+ mph wind for every team".
- **Cover % and EPA in the explorer (2026-10-19).** The explorer shows win %, margin, scoring and over %. Cover % and EPA/play (2016 on) are in `team_games` and could join the cards, with the same one-sided / shared split.
- **EPA can't show home field or roof (2026-10-18).**
  - nflfastR's expected-points model already takes in whether the offense is at home, the roof type and the era (Ben Baldwin, "nflfastR EP, WP, CP xYAC, and xPass models", Open Source Football, 2020). So EPA/play splits by venue or roof read near zero by design: over 2016–2025, home teams' net EPA/play was +0.001 while they won by 2.0 points a game.
  - The team pages and the methodology page should say so, so that a flat EPA split isn't read as "no home edge". Weather isn't a model input, so EPA does show wind and rain.

- **Team names on the 404 page (2026-10-22).** The not-found page lists the 32 team codes from `web/lib/team-codes.json`, not names: it's part of every route, so an uncached query there made even the home page query the database on each visit. Once step 1.5 caches `getTeams()`, the names (and badges) can come back without that cost.

## Tooling and operations

- **npm audit: findings in the dev toolchain (2026-10-17, 2026-10-19).**
  - **eslint:** 5 high-severity findings sit under `eslint-config-next` 16.4.1 (`@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`, advisory GHSA-vfj7-8cjw-p6xm, a denial of service via deeply nested glob patterns).
  - **shadcn CLI (2026-10-21):** the same `braces` advisory reaches 4 more packages through the `shadcn` devDependency (`@shadcn/registry` and `ts-morph` → `fast-glob`), making 9 high findings in all.
  - **drizzle-kit:** a moderate finding through `@esbuild-kit/esm-loader` → `esbuild`, whose development server answers any website's requests. That server is never started.
  - **Exposure:** all are dev-only; `npm audit --omit=dev` finds 0 vulnerabilities, so nothing ships to the site. npm's only fix for the first is downgrading `eslint-config-next` to 14.x, which would break linting.
  - **When to recheck:** when Next publishes a patched `eslint-config-next` and drizzle-kit drops `@esbuild-kit`, at the latest in step 7.3.
- **Check documentation coverage in CI (2026-10-17).** All 391 warehouse columns have a description, checked once with a script comparing `transform/target/manifest.json` with `information_schema`. A pull-request check (step 1.3 or later) that fails when a new model or column has no description would keep it that way.
- **Restore the Open-Meteo cache for full rebuilds in CI (2026-10-19).** The weather cache (`pipeline/.cache/open-meteo/`, 85 MB) is gitignored, so a full rebuild on a fresh machine refetches about 6,000 games, around 90 minutes at Open-Meteo's free-tier pace. The nightly incremental run only fetches the current season. Any full rebuild in CI needs the cache restored first, e.g. with the GitHub Actions cache (step 1.6).
