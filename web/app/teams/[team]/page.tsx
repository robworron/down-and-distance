import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Container } from "@/components/container";
import { SectionError } from "@/components/section-error";
import { TeamPageSkeleton } from "@/components/skeletons";
import { HeadlineStats } from "@/components/team/headline-stats";
import { RangeControls } from "@/components/team/range-controls";
import { SeasonTable } from "@/components/team/season-table";
import { SplitsSection } from "@/components/team/splits-section";
import { TeamHeader } from "@/components/team/team-header";
import {
  getLatestSeason,
  getLeagueSplitSums,
  getSeasonRecords,
  getSituations,
  getSplitSums,
  getTeamProfile,
} from "@/lib/queries";
import { winPct } from "@/lib/records";
import { includes2020, parseSeasonRange, rangeQuery, seasonTypes } from "@/lib/season-range";
import { buildSplits, teamTotal } from "@/lib/splits";
import { parseTeamSlug } from "@/lib/team-slug";

type Props = PageProps<"/teams/[team]">;

// Unknown and capitalised team codes never reach this page: Proxy answers
// them first with a real 404 or 308 (proxy.ts). The checks below are the
// fallback if it ever didn't run; a 404 from here would stream as a 200 with
// a noindex tag, which is why Proxy does the real check.

/** Look up the team for a URL segment; null for anything that isn't one. */
async function teamFor(segment: string) {
  const slug = parseTeamSlug(segment);
  return slug.kind === "ok" ? getTeamProfile(slug.abbr) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const segment = (await params).team;
  // If the lookup fails, the page body shows its own section error; the
  // title falls back to the code rather than failing the whole page.
  const team = await teamFor(segment).catch(() => undefined);
  if (team === undefined) return { title: segment.toUpperCase() };
  if (!team) return { title: "Page not found" };
  return {
    title: team.name,
    description: `The ${team.name}' record season by season, and how they do in each game situation (weather, rest, travel, venue) beside the league, with the number of games behind every figure.`,
  };
}

export default function TeamPage({ params, searchParams }: Props) {
  return (
    <main>
      {/* The team and the season range are only known at request time, so
          everything that reads them (and queries the database) streams in
          behind this boundary. A failed query shows an inline message. */}
      <SectionError what="this team's page" contained>
        <Suspense fallback={<TeamPageSkeleton />}>
          <TeamView params={params} searchParams={searchParams} />
        </Suspense>
      </SectionError>
    </main>
  );
}

async function TeamView({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [team, query] = await Promise.all([params.then((p) => teamFor(p.team)), searchParams]);
  if (!team) notFound();
  const abbr = team.abbr;
  const [records, latestSeason, situations] = await Promise.all([getSeasonRecords(abbr), getLatestSeason(), getSituations()]);
  if (latestSeason === null) throw new Error("No seasons in marts.games");

  // The URL is the page's state: ?from=2023&to=2025&playoffs=1&with2020=1.
  const range = parseSeasonRange(query, latestSeason);
  const types = seasonTypes(range);
  const [teamSums, leagueSums] = await Promise.all([getSplitSums(range, types), getLeagueSplitSums(range, types)]);

  // 2020 (mostly empty stadiums) is left out of home/away splits unless the
  // viewer keeps it; every other split, and the header, count it.
  const has2020 = includes2020(range);
  const groups = buildSplits({ team: abbr, situations, teamSums, leagueSums, exclude2020: has2020 && !range.with2020 });
  const basePath = `/teams/${abbr.toLowerCase()}`;
  const toggle2020 = has2020
    ? { included: range.with2020, href: `${basePath}${rangeQuery({ ...range, with2020: !range.with2020 }, latestSeason)}` }
    : null;

  const spark = records
    .filter((r) => r.regular.games > 0)
    .map((r) => ({ season: r.season, winPct: winPct(r.regular)! }))
    .reverse();
  const span: [number, number] = [range.from, range.to];
  const total = teamTotal(teamSums, abbr);
  const firstSeason = spark[0]?.season ?? null;

  return (
    <>
      <TeamHeader team={team} spark={spark} range={span} />
      {/* Sticky from 768 px up; on phones the row wraps to three lines,
          too tall to keep on screen while scrolling. */}
      <div className="z-30 border-b bg-background/95 backdrop-blur-sm md:sticky md:top-0">
        <Container>
          <RangeControls basePath={basePath} range={range} latest={latestSeason} />
        </Container>
      </div>
      <Container>
        <HeadlineStats total={total} range={span} playoffs={range.playoffs} />

        {total.games > 0 ? (
          <SplitsSection groups={groups} toggle2020={toggle2020} team={team.nick} />
        ) : (
          <NoGamesInRange team={team.name} span={span} firstSeason={firstSeason} href={basePath} />
        )}

        <section aria-labelledby="season-by-season" className="mt-10">
          <h2 id="season-by-season" className="text-lg font-semibold">
            Season by season
          </h2>
          <p className="mt-1 mb-3 max-w-[72ch] text-sm text-ink-2">
            Every season, whatever the range above. Regular season, with the playoffs in the last column. Win % counts a tie
            as half a win. Seasons before 2021 had 16 games, not 17.
          </p>
          <SeasonTable records={records} />
        </section>
      </Container>
    </>
  );
}

/** The range holds none of the team's games (e.g. HOU 1999–2001, before the Texans' first season). */
function NoGamesInRange({
  team,
  span,
  firstSeason,
  href,
}: {
  team: string;
  span: [number, number];
  firstSeason: number | null;
  href: string;
}) {
  const seasons = span[0] === span[1] ? `${span[0]}` : `${span[0]}–${span[1]}`;
  return (
    <div role="status" className="mt-4 rounded-lg border bg-card p-4">
      <p className="font-medium">No games in {seasons}.</p>
      <p className="mt-1 text-sm text-ink-2">
        {firstSeason !== null && firstSeason > span[1] ? `The ${team}' first season was ${firstSeason}. ` : ""}
        Pick other seasons above, or <Link href={href}>show the latest seasons</Link>.
      </p>
    </div>
  );
}
