import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Container } from "@/components/container";
import { ExplorerForm } from "@/components/explorer/explorer-form";
import { ExplorerResults } from "@/components/explorer/explorer-results";
import { SectionError } from "@/components/section-error";
import { ExplorerSkeleton } from "@/components/skeletons";
import {
  buildExplorerResult,
  excludes2020,
  explorerQuery,
  parseExplorer,
  withoutValue,
  type ExplorerState,
  type Rejection,
} from "@/lib/explorer";
import { getExplorerSums, getLatestSeason, getSituations, getTeams, type Situation } from "@/lib/queries";
import { includes2020, rangePresets } from "@/lib/season-range";

export const metadata: Metadata = {
  title: "Situation explorer",
  description: "Stack situations (outdoors, 15+ mph wind, away) and see how the league and any team do in them, with n and a 95% CI.",
};

export default function ExplorerPage({ searchParams }: PageProps<"/explorer">) {
  return (
    <main>
      <Container className="py-8">
        <h1 className="text-3xl font-bold tracking-tight">Situation explorer</h1>
        <p className="mt-2 max-w-[72ch] text-ink-2">
          Combine situations and see how teams did in them. Tick two values of one situation to allow either; every situation
          you pick must hold. The small grey figures are 95% confidence intervals: the range the games can&apos;t rule out.
        </p>
        {/* The filters live in the URL, which is only known at request time. */}
        <SectionError what="the explorer">
          <Suspense fallback={<ExplorerSkeleton />}>
            <ExplorerView searchParams={searchParams} />
          </Suspense>
        </SectionError>
      </Container>
    </main>
  );
}

async function ExplorerView({ searchParams }: Pick<PageProps<"/explorer">, "searchParams">) {
  const [query, situations, teams, latest] = await Promise.all([searchParams, getSituations(), getTeams(), getLatestSeason()]);
  if (latest === null) return <p className="mt-8">No games loaded yet.</p>;

  const { state, rejected } = parseExplorer(query, situations, teams.map((t) => t.abbr), latest);
  const href = (s: ExplorerState) => `/explorer${explorerQuery(s, latest)}`;

  // Anything the registry doesn't know stops here: no query runs.
  if (rejected.length > 0) return <Rejected rejected={rejected} cleanHref={href(state)} />;

  const result = buildExplorerResult(state, await getExplorerSums(state));
  const labels = valueLabels(situations);
  const teamName = state.team ? (teams.find((t) => t.abbr === state.team)?.name ?? null) : null;
  const hasVenue = state.filters.some((f) => f.key === "venue");

  return (
    // Phones show the results first (with a link down to the filters);
    // wider screens put the filters in a left column.
    <div className="mt-6 grid gap-8 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <div id="filters" className="order-2 scroll-mt-4 lg:order-1">
        <ExplorerForm
        situations={situations.map(({ key, label, level, tier, values }) => ({ key, label, level, tier, values }))}
        selected={Object.fromEntries(state.filters.map((f) => [f.key, f.values]))}
        range={state.range}
        team={state.team}
        teams={teams.map(({ abbr, name }) => ({ abbr, name }))}
        latest={latest}
        presets={rangePresets(state.range, latest).map((p) => ({
          label: p.label,
          href: href({ ...state, range: p.range }),
          current: p.range.from === state.range.from && p.range.to === state.range.to,
        }))}
        />
      </div>
      <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
        <a href="#filters" className="text-sm lg:hidden">
          Change situations ↓
        </a>
        {state.filters.length > 0 && (
          <ul aria-label="Chosen situations" className="flex flex-wrap gap-1.5 text-sm">
            {state.filters.flatMap((f) =>
              f.values.map((v) => (
                <li key={`${f.key}-${v}`}>
                  <Link
                    href={href(withoutValue(state, f.key, v))}
                    scroll={false}
                    aria-label={`Remove ${labels.get(f.key)?.label}: ${labels.get(f.key)?.values.get(v)}`}
                    className="inline-flex items-center gap-1 rounded-full border border-highlight bg-highlight-wash px-2.5 py-0.5 text-highlight-ink no-underline"
                  >
                    {labels.get(f.key)?.label}: {labels.get(f.key)?.values.get(v)} <span aria-hidden="true">×</span>
                  </Link>
                </li>
              )),
            )}
          </ul>
        )}
        <p className="text-sm text-ink-2">
          {state.range.from === state.range.to ? state.range.from : `${state.range.from}–${state.range.to}`},{" "}
          {state.range.playoffs ? "regular season and playoffs" : "regular season"}.
          {hasVenue && includes2020(state.range) && (
            <>
              {" "}
              {excludes2020(state)
                ? "2020 is left out because venue is one of the filters: most of its games were played in empty stadiums. "
                : "2020 is included, though most of its games were played in empty stadiums. "}
              <Link href={href({ ...state, range: { ...state.range, with2020: !state.range.with2020 } })} scroll={false}>
                {excludes2020(state) ? "Include 2020" : "Leave 2020 out"}
              </Link>
            </>
          )}
        </p>
        <ExplorerResults result={result} teamName={teamName} />
      </div>
    </div>
  );
}

function valueLabels(situations: Situation[]) {
  return new Map(situations.map((s) => [s.key, { label: s.label, values: new Map(s.values.map((v) => [v.value, v.label])) }]));
}

function Rejected({ rejected, cleanHref }: { rejected: Rejection[]; cleanHref: string }) {
  return (
    <section className="mt-8 max-w-[72ch] rounded-lg border bg-card p-4" aria-labelledby="rejected">
      <h2 id="rejected" className="text-base font-semibold">
        This link has filters the explorer doesn&apos;t recognise
      </h2>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {rejected.map((r) => (
          <li key={`${r.param}=${r.value}`}>
            <code>
              {r.param}
              {r.value !== "" && `=${r.value}`}
            </code>{" "}
            {r.reason}.
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        Nothing was looked up. <Link href={cleanHref}>Open the explorer without them</Link>
      </p>
    </section>
  );
}
