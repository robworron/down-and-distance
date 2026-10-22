import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Container } from "@/components/container";
import { SectionError } from "@/components/section-error";
import { LeaderboardSkeleton } from "@/components/skeletons";
import { InfoTip } from "@/components/info-tip";
import { BoardForm } from "@/components/leaderboard/board-form";
import { BoardTable } from "@/components/leaderboard/board-table";
import { formatCount, formatPct } from "@/lib/format";
import { boardQuery, buildLeaderboard, parseBoard } from "@/lib/leaderboard";
import { getLatestSeason, getLeagueSplitSums, getSituations, getSplitSums, getTeams } from "@/lib/queries";
import { includes2020, rangePresets, rangeQuery, seasonTypes } from "@/lib/season-range";
import { LEVELS } from "@/lib/situation-text";

export const metadata: Metadata = {
  title: "Leaderboards",
  description: "Every team in one situation, ranked by a best estimate that allows for small samples, with each team's record and n.",
};

export default function LeaderboardsPage({ searchParams }: PageProps<"/leaderboards">) {
  return (
    <main>
      <Container className="py-8">
        <h1 className="text-3xl font-bold tracking-tight">Leaderboards</h1>
        <p className="mt-2 max-w-[72ch] text-ink-2">
          Every team in one situation. Ranked by the best estimate. A few games move it only a little, so the order mostly
          follows how good each team is overall.
        </p>
        {/* The choices live in the URL, which is only known at request time. */}
        <SectionError what="the leaderboard">
          <Suspense fallback={<LeaderboardSkeleton />}>
            <BoardView searchParams={searchParams} />
          </Suspense>
        </SectionError>
      </Container>
    </main>
  );
}

async function BoardView({ searchParams }: Pick<PageProps<"/leaderboards">, "searchParams">) {
  const [query, situations, teams, latest] = await Promise.all([searchParams, getSituations(), getTeams(), getLatestSeason()]);
  if (latest === null) return <p className="mt-8">No games loaded yet.</p>;

  const { choice, rejected } = parseBoard(query, situations, latest);
  if (!choice) {
    return (
      <section className="mt-8 max-w-[72ch] rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">This link asks for a leaderboard the site doesn&apos;t have</h2>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {rejected.map((r) => (
            <li key={r.param}>
              <code>
                {r.param}={r.value}
              </code>{" "}
              {r.reason}.
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          Nothing was looked up. <Link href="/leaderboards">Open the leaderboards</Link>
        </p>
      </section>
    );
  }

  const { situation, value, range } = choice;
  const types = seasonTypes(range);
  const [teamSums, leagueSums] = await Promise.all([getSplitSums(range, types), getLeagueSplitSums(range, types)]);
  const exclude2020 = includes2020(range) && !range.with2020;
  const board = buildLeaderboard({ situation, value, teamSums, leagueSums, exclude2020 });

  const valueLabel = situation.values.find((v) => v.value === value)!.label;
  const span = range.from === range.to ? `${range.from}` : `${range.from}–${range.to}`;
  const href = (r: typeof range) => `/leaderboards${boardQuery(situation.key, value, r, latest)}`;
  const teamsByAbbr = new Map(teams.map((t) => [t.abbr, t]));
  const level = LEVELS[situation.level];

  return (
    <>
      <div className="mt-4 border-b">
        <BoardForm
          situations={situations.map((s) => ({ key: s.key, label: s.label }))}
          situation={situation.key}
          value={value}
          values={situation.values}
          range={range}
          latest={latest}
          presets={rangePresets(range, latest).map((p) => ({
            label: p.label,
            href: href(p.range),
            current: p.range.from === range.from && p.range.to === range.to,
          }))}
        />
      </div>

      <section aria-labelledby="board-title" className="mt-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h2 id="board-title" className="text-lg font-semibold">
            {situation.label}: {valueLabel}
          </h2>
          <span className="rounded-full border px-2 py-0.5 text-xs text-ink-2">
            <InfoTip tip={level.tip}>{level.label}</InfoTip>
          </span>
        </div>
        <p className="max-w-[72ch] text-sm text-ink-2">
          {span}, {range.playoffs ? "regular season and playoffs" : "regular season"}.{" "}
          {board.league.n === 0
            ? ""
            : board.league.kind === "win"
            ? `Across the league: ${formatPct(board.league.winPct?.value ?? null)} win % in ${formatCount(board.league.n)} team-games.`
            : `Both teams share this, so across the league one wins and the other loses. Its ${formatCount(board.league.n)} games averaged ${
                board.league.total ? board.league.total.value.toFixed(1) : "—"
              } points, ${formatPct(board.league.overPct?.value ?? null)} over.`}
          {situation.key === "venue" && includes2020(range) && (
            <>
              {" "}
              {exclude2020 ? "2020 is left out: most of its games were played in empty stadiums. " : "2020 is included, though most of its games were played in empty stadiums. "}
              <Link href={href({ ...range, with2020: !range.with2020 })} scroll={false}>
                {exclude2020 ? "Include 2020" : "Leave 2020 out"}
              </Link>
            </>
          )}
        </p>
        {board.ranked.length === 0 && board.greyed.every((r) => r.n === 0) ? (
          // Nobody played in this value in these seasons (e.g. snow over a
          // single season): a table of 32 "no games" rows would say nothing.
          <p role="status" className="rounded-lg border bg-card p-4 text-sm">
            No team played a game in this situation in {span}. Try a wider range of seasons or another value.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground md:hidden">Swipe for more columns →</p>
            <BoardTable
              ranked={board.ranked}
              greyed={board.greyed}
              teams={teamsByAbbr}
              valueLabel={`${situation.label.toLowerCase()}: ${valueLabel}`}
              hrefFor={(abbr) => `/teams/${abbr.toLowerCase()}${rangeQuery(range, latest)}#situation-${situation.key}`}
            />
          </>
        )}
        <div className="text-xs text-muted-foreground">
          <p>
            Usual: the team&apos;s win % in all its games in these seasons. Win % counts a tie as half a win; the small figures
            are its 95% confidence interval.
          </p>
          {board.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      </section>
    </>
  );
}
