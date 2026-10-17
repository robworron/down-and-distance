# Down & Distance

Situational analytics for NFL teams: how each team performs by weather, venue, rest, travel and kickoff time, plus weekly game predictions.

Work in progress. See `docs/build-plan.md` for the plan and `docs/data-model.md` for the database.

## Run it locally

You need Docker Desktop, [uv](https://docs.astral.sh/uv/) and Node.js.

1. Copy `.env.example` to `.env` and fill it in. For local work, the three `POSTGRES_` values are your choice, and `DATABASE_URL` is `postgresql://USER:PASSWORD@localhost:15432/DB` using those same values. The Neon values are only needed for production loads.
2. Start Postgres: `docker compose up -d` (host port 15432).
3. Install Python dependencies: `uv sync`.
4. Load the data: `uv run python -m pipeline ingest --full`. The first run fetches weather for about 6,000 games from Open-Meteo, paced to the free tier, so it takes about 90 minutes. Responses are cached in `pipeline/.cache/`, and later runs take seconds.
5. Check it: `uv run pytest`.
6. Website: create `web/.env.local` containing the same `DATABASE_URL` line (Next.js reads env files only from its own folder), then in `web/` run `npm ci` and `npm run dev`.

Data: [nflverse](https://github.com/nflverse) and [Open-Meteo](https://open-meteo.com/).
