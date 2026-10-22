# Plan: states and polish (1.4), caching and the refresh route (1.5)

**Status:** design agreed with Rob on 2026-10-19; not started.

Read this with `CLAUDE.md`, `docs/decisions.md` and Phase 1 of `docs/build-plan.md`. Where this plan and `decisions.md` disagree, `decisions.md` wins.

## Context

The team research pages are live: team pages, the situation explorer, leaderboards and the situational This week. Two cross-cutting steps remain before the player features:
- **1.4:** states, with a real HTTP 404.
- **1.5:** caching, with an on-demand refresh route for the nightly job (1.6).

Both decide what runs before the first Suspense boundary and what goes into the static shell, across every page at once. 1.5 caches and prerenders the lookup that 1.4's 404 check introduces. The player pages reuse both patterns.

## Next.js facts that shape the design

Next.js 16.4.1, with `cacheComponents` and `partialPrefetching`. From the bundled docs (`web/node_modules/next/dist/docs/`):

- **Status is fixed at the first stream.** The response status is fixed when streaming starts: when the first `<Suspense>` fallback renders, or when a component suspends inside one. `notFound()` before that point gives a real 404; after it, a 200 plus a `noindex` tag.
- **No `dynamicParams`, no `loading.tsx`.** `dynamicParams = false` isn't available under Cache Components, and a `loading.tsx` would start the stream before the page runs.
- **Unlisted params need `instant = false`.** A page that awaits `params` outside `<Suspense>` has an empty fallback shell for codes not in `generateStaticParams`. That needs `export const instant = false`, which turns off the empty-shell check for that route only.
- **Where `use cache` output lives.** Output in a prerendered shell is stored durably by Vercel. Output computed at request time (anything after reading `searchParams`) lives in each server instance's memory.
- **`revalidateTag` needs a profile.** It takes a profile as its second argument; the one-argument form is deprecated. `{ expire: 0 }` expires entries at once when a route handler (not a Server Action) does the refresh.

## Settled decisions (Rob, 2026-10-19)

- **Small samples.** Below 3 games, margin and game-total intervals read "too few games for a range". This applies everywhere: tables, chart whiskers, tooltips, the explorer and This week.
  - Over 2024–26 it changes 154 of 1,247 team-page rows; 1-game rows never had an interval.
  - Win % intervals (Wilson) are unchanged.
- **Refresh.** The route calls `revalidateTag('marts', { expire: 0 })`, so the next visit to each page re-renders with fresh data. The nightly job requests the main pages right after the call, so visitors rarely wait.
- **Real 404.** Checked in the page before any Suspense boundary, not in Proxy, so there's no second copy of the team list to keep in sync.
  - **Superseded 2026-10-22 (Rob):** in Next 16.4.1 with this app's settings, a page's `notFound()` never set a 404 status, before streaming or not. The check moved to Proxy, with the codes in one file (`web/lib/team-codes.json`) checked against `marts.dim_teams`. See `docs/decisions.md`, "Team URLs checked in Proxy".
- **Caching:**
  - **Plain `use cache`,** with one tag (`marts`) and one lifetime profile (`marts`). All data changes together after the nightly dbt build.
  - **No `use cache: remote`.** Hobby's allowance for Vercel's runtime cache isn't published (searched 2026-10-19), and going over Hobby limits pauses the project.

## Rules that apply

- **Text and colour:** plain language with no internal step names; colour roles only.
- **Same parts as the team pages:** tier headings, the level chips ("Same for both teams" / "Differs by team") and featured accents.
- **Tables:** a sticky first column, the swipe cue, and CIs on a quiet second line. League figures show n, with the CI on hover.
- **Data rules:**
  - Regular season by default, with "Include playoffs".
  - The 2020 venue rule wherever venue is involved.
  - Every figure carries its n.
  - Values are bound parameters, and filter columns come only from the registry.

## 1.4 States and polish

**Concept to explain first.** The status code goes out with the first streamed bytes, so checking before the first Suspense boundary gives a real 404. Then come loading, empty and error states, and page metadata.

> **As built (2026-10-22).** The first four bullets under "A real 404 on team pages" were tried and didn't give a 404 (`docs/decisions.md`, "Team URLs checked in Proxy"). Instead:
> - `web/proxy.ts` (matcher `/teams/:team`) answers before rendering: 308 to the lower-case URL, keeping the query string; anything else that isn't one of the 32 codes is rewritten to a path no route matches, so Next.js renders `app/not-found.tsx` inside the site layout with a real 404.
> - There's one not-found page, the root one. It says "No team with that code" for `/teams/...` URLs and links all 32 codes; it reads no data, because it's part of every route.
> - The team page streams everything again, with no `instant = false` and no wait before the first byte; its own slug check is the fallback.
> The rest of this section was built as written.

- **A real 404 on team pages.**
  - **Check before streaming.** `app/teams/[team]/page.tsx` awaits `params` and validates the slug; an upper-case code gets a `permanentRedirect` (308) to lower case. It awaits `getTeamProfile` before any `<Suspense>`, and calls `notFound()` on null.
  - **What stays streamed:** everything that reads `searchParams` stays inside `<Suspense>`.
  - **Route settings:** `export const instant = false`, with a comment explaining that unlisted codes have an empty fallback shell by design. No `loading.tsx` under `/teams`.
  - **The 404 page:** `app/teams/[team]/not-found.tsx`, "No team with that code", linking to all 32 teams.
  - **A temporary wait:** until 1.5 caches the lookup, the page waits for that one query before sending anything. Measure it; 1.5 removes it.
- **Loading.** Skeleton fallbacks the size of the content they replace: team splits, explorer results, the leaderboard table, This week and the teams index.
- **Errors.**
  - **Boundaries:** `app/error.tsx` (a client component with retry and a home link) and `app/global-error.tsx`.
  - **Section-level:** `catchError` boundaries around each streamed data section, so a failed query shows an inline error while the rest of the page still renders.
  - **Checked once** by a local `next start` with the database stopped, then restored.
- **Empty states:**
  - a team with no games in the range (HOU 1999–2001);
  - no explorer matches, suggesting a wider range or one fewer filter;
  - a leaderboard value with no games;
  - no games this week.
- **Metadata:**
  - **Team pages:** `generateMetadata` gives the team name and a one-line description.
  - **Other pages:** static titles and descriptions for the explorer, leaderboards and This week.
  - **Not-found pages:** their own titles.
- **Two open items, decided:**
  - **Small samples:** the below-3 rule lives in one helper, `MIN_GAMES_FOR_INTERVAL = 3`. Charts drop the whisker, and the accessible name says why.
  - **Touch hints:** one shared `Hint` component.
    - **With a mouse:** a Radix tooltip on hover or focus.
    - **On touch screens:** a popover that opens on tap (`npx shadcn@latest add popover`), detected with `(hover: none)`.
    - **Used by:** InfoTip, league figures, the Shrunk cell, chart readouts and the new pages.
    - **Checked** in the browser pane's mobile preset, which emulates touch.

**Done when:**
- `curl -s -o /dev/null -w "%{http_code}"` returns 404 for `/teams/xyz`, 200 for `/teams/buf` and 308 for `/teams/BUF`, on a local `next start` and live. The 404 page renders inside the site layout.
- Each empty and error state is shown once (screenshots).
- Every route's title and description are read from its HTML head.
- Tests, lint and build pass.

**Production.** No Neon change: push, then check the live status codes with curl.

## 1.5 Caching and the refresh route

> **As built (2026-10-22).** Built as written, with three points the 1.4 changes settled:
> - **No pre-stream lookup to cache.** After 1.4 the team page streams everything, and Proxy checks the code, so there was no wait to remove. `generateStaticParams` lists the 32 codes from the cached `getTeams()`; the header and the season table are in each prerendered shell. The range bar, headline figures, splits and the sparkline's shading stream: the shading arrives through a `<Suspense>` slot in the header, with an unshaded sparkline in the shell.
> - **No `instant = false`.** The build accepted the structure without it.
> - **The root not-found page still reads no data** (1.4's rule); showing team names there is in the parking lot.
>
> Results, measurements and the guarantees table: `docs/decisions.md` ("Caching and the refresh route").

**Concept to explain first:**
- **the static shell versus the streamed parts;**
- **`use cache`,** with a lifetime and a tag;
- **refreshing on demand** through a secret-protected route;
- **why serverless instances don't share** in-memory caches.

**The work:**
- **`next.config.ts`** gets `cacheLife: { marts: { stale: 300, revalidate: 86_400, expire: 31_536_000 } }`:
  - `stale`: 5 minutes in the browser;
  - `revalidate`: daily, as a safety net if the nightly call fails;
  - `expire`: a year, so a page left idle never makes a visitor wait.
- **Every query** in `lib/queries.ts` gets `'use cache'`, `cacheLife('marts')` and `cacheTag('marts')`. Their arguments are plain values.
- **Pages:**
  - **In the static shell:** everything that doesn't read the query string. That's the home page, the teams index, all of This week, and each team's header and season table.
  - **Streamed:** parts that depend on the query string, from the cached functions.
  - **Small changes:** remove `connection()` from `/teams`. The sparkline's range shading moves into the streamed part, or into a small client component.
- **`generateStaticParams`** on `/teams/[team]` returns the 32 codes from `getTeams()`, so 32 team shells are prerendered. Unlisted codes still render on request and return 404.
- **Builds now need the database.** Vercel passes its environment variables to the build. Local builds read `web/.env.local`, so Docker must be running.
- **`app/api/revalidate/route.ts`,** POST only; GET gets 405 automatically.
  - **Authorization:** it checks `Authorization: Bearer <REVALIDATE_SECRET>` in constant time (`crypto.timingSafeEqual`). The check is a pure helper with a unit test.
  - **Failure responses:** 503 if no secret is configured (it fails closed); 401, with no detail, for a wrong or missing header.
  - **Success:** it calls `revalidateTag('marts', { expire: 0 })` and returns 200 with `{ revalidated: true, at }`, marked `no-store`.
  - **The secret never appears in a URL.**
- **The secret:**
  - **Generated locally** and written to `.env` and `web/.env.local` without being printed; `.env.example` gets the name only.
  - **Vercel:** Rob adds it before the deploy, following click-by-click steps.
  - **GitHub:** step 1.6 adds it as a repository secret.
  - **`CLAUDE.md`** gains the fourth `.env` variable, the second line of `web/.env.local`, and the refresh command (curl with the header read from `.env`, never echoed).

**Done when:**
- **The route table from `next build`:**
  - `/`, `/teams` and `/this-week`: static (○);
  - `/teams/[team]`: 32 prerendered shells (◐) plus the fallback;
  - `/explorer` and `/leaderboards`: ◐;
  - `/api/revalidate`: dynamic (ƒ).
- **Repeat visits are fast.**
  - **Measure** curl's `time_starttransfer` on the first and the repeat visit, before and after this step.
  - **Pages:** `/`, `/teams`, `/teams/buf`, `/teams/buf?from=2016&to=2025`, `/explorer`, `/leaderboards` and `/this-week`.
  - **Where:** on a local `next start` and live. The live baseline is taken just before the push.
  - **Live static shells** show `x-vercel-cache: HIT`.
- **Calling the route refreshes the data.**
  - **Locally:**
    1. Change one value in the local marts, e.g. BUF's `team_nick` in `marts.dim_teams`.
    2. Confirm the page still serves the old value.
    3. POST to the route with the secret; the next visit shows the new value.
    4. Restore it with `dbt build --select dim_teams`.
  - **Error responses:** a wrong secret gives 401, GET gives 405, and a missing secret gives 503.
  - **Live:** a POST with the secret returns 200, and the next request re-renders before turning back into a cache hit.
- Tests, lint, build and pytest pass.

**Production:**
1. Rob adds `REVALIDATE_SECRET` in Vercel (Production) and confirms.
2. No Neon change.
3. Push, watch the Vercel build reach the database, then run the live checks.

**Docs:**
- `decisions.md`: the profile, the tag, the refresh behaviour (Rob's choice), why not remote, and `instant = false`.
- Parking lot:
  - measure cold visits, and consider `use cache: remote` after checking Hobby's runtime-cache allowance;
  - add `prefetch={true}` to team links if navigation feels slow.

## Hooks for step 1.6

- `REVALIDATE_SECRET` becomes a repository secret.
- The workflow's last step POSTs to `/api/revalidate`, then requests the main pages.
- The footer's freshness stamp reads `marts.data_freshness` through a cached query with the `marts` tag.

## Every step

- **Before code:** explain the step's concept in 2–4 sentences.
- **After the step:**
  1. Run the Done-when check.
  2. Make one commit starting with the step number, with the box ticked and the docs updated.
  3. Push, then do the production check.
- **Production order:** stop for Rob before any Neon or Vercel change.
