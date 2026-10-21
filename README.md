# Down & Distance

A free, public fantasy football research application. It tracks what changed in a player's role, how that could affect this week's fantasy production, and how uncertain a projection is. It compares players in Standard, Half-PPR and PPR scoring, with every number traceable to its source.

## Status

**Built: the foundation (Phase 0).** An NFL data engineering, analytics and research platform, live at https://down-and-distance-chi.vercel.app/:
- Python pipelines load nflverse schedules (1999+), play-by-play (2016+) and Open-Meteo weather into PostgreSQL.
- A tested dbt warehouse turns them into team and game marts.
- A pre-registered statistical analysis.
- Team and situation research pages: team splits, an explorer, leaderboards and this week's games.

**Planned: the fantasy features.**
- Player data: weekly stats, rosters and snap counts.
- Fantasy scoring in three formats.
- Player pages, an Opportunity Tracker and a two-player compare.
- Honestly evaluated projections with a graded track record.

These are being built step by step, in Phases 1–7 of `docs/build-plan.md`.

## Documentation

- `docs/requirements.md`: product requirements and acceptance criteria.
- `docs/build-plan.md`: the development roadmap, current state, data sources and release milestones.
- `docs/decisions.md`: the technical decisions and their reasons.
- `docs/data-model.md`: the database tables and their checks.
- `docs/findings.md`: results of the team situation analysis.

## Run it locally

You need Docker Desktop, [uv](https://docs.astral.sh/uv/) and Node.js.

1. Copy `.env.example` to `.env` and fill it in. For local work, the three `POSTGRES_` values are your choice, and `DATABASE_URL` is `postgresql://USER:PASSWORD@localhost:15432/DB` using those same values. The Neon values are only needed for production loads.
2. Start Postgres: `docker compose up -d` (host port 15432).
3. Install Python dependencies: `uv sync`.
4. Load the data: `uv run python -m pipeline ingest --full`. The first run fetches weather for about 6,000 games from Open-Meteo, paced to the free tier, so it takes about 90 minutes. Responses are cached in `pipeline/.cache/`, and later runs take seconds.
5. Build the warehouse: `uv run python -m pipeline dbt build`.
6. Check it: `uv run pytest`.
7. Website: create `web/.env.local` containing the same `DATABASE_URL` line (Next.js reads env files only from its own folder), then in `web/` run `npm ci` and `npm run dev`.

## Data and credits

Data: [nflverse](https://github.com/nflverse) (CC BY 4.0) and [Open-Meteo](https://open-meteo.com/) (CC BY 4.0). Not affiliated with the NFL.
