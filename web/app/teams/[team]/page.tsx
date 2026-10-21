import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Container } from "@/components/container";
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

export default function TeamPage({ params, searchParams }: PageProps<"/teams/[team]">) {
  return (
    <main>
      {/* The team code and the season range are only known at request time,
          so everything that reads them (and queries the database) streams in
          behind this boundary. */}
      <Suspense fallback={<Container className="py-8 text-muted-foreground">Loading team…</Container>}>
        <TeamView params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function TeamView({ params, searchParams }: Pick<PageProps<"/teams/[team]">, "params" | "searchParams">) {
  const [{ team: slug }, query] = await Promise.all([params, searchParams]);
  if (!/^[a-z]{2,3}$/i.test(slug)) notFound();
  const abbr = slug.toUpperCase();

  const [team, records, latestSeason, situations] = await Promise.all([
    getTeamProfile(abbr),
    getSeasonRecords(abbr),
    getLatestSeason(),
    getSituations(),
  ]);
  if (!team || latestSeason === null) notFound();

  // The URL is the page's state: ?from=2023&to=2025&playoffs=1&with2020=1.
  const range = parseSeasonRange(query, latestSeason);
  const types = seasonTypes(range);
  const [teamSums, leagueSums] = await Promise.all([getSplitSums(range, types), getLeagueSplitSums(range, types)]);

  // 2020 (mostly empty stadiums) is left out of home/away splits unless the
  // viewer keeps it; every other split, and the header, count it.
  const has2020 = includes2020(range);
  const groups = buildSplits({ team: abbr, situations, teamSums, leagueSums, exclude2020: has2020 && !range.with2020 });
  const basePath = `/teams/${slug.toLowerCase()}`;
  const toggle2020 = has2020
    ? { included: range.with2020, href: `${basePath}${rangeQuery({ ...range, with2020: !range.with2020 }, latestSeason)}` }
    : null;

  const spark = records
    .filter((r) => r.regular.games > 0)
    .map((r) => ({ season: r.season, winPct: winPct(r.regular)! }))
    .reverse();
  const span: [number, number] = [range.from, range.to];

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
        <HeadlineStats total={teamTotal(teamSums, abbr)} range={span} playoffs={range.playoffs} />

        <SplitsSection groups={groups} toggle2020={toggle2020} team={team.nick} />

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
