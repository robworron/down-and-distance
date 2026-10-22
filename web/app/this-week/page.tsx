import type { Metadata } from "next";
import { Suspense } from "react";

import { Container } from "@/components/container";
import { SectionError } from "@/components/section-error";
import { ThisWeekSkeleton } from "@/components/skeletons";
import { GameCard } from "@/components/this-week/game-card";
import { EFFECT_SEASONS, FEATURED_GAME_KEYS, FEATURED_TEAM_KEYS, effectId, featuredEffects } from "@/lib/effects";
import { getLatestSeason, getSeasonLeagueSums, getSituations, getSplitSums, getTeams, getThisWeek } from "@/lib/queries";
import { defaultRange } from "@/lib/records";
import { includes2020 } from "@/lib/season-range";
import { buildThisWeek } from "@/lib/this-week";

export const metadata: Metadata = {
  title: "This week",
  description: "This week's games with the situations each team faces: rest, travel, roof and kickoff, with each team's record in them.",
};

export default function ThisWeekPage() {
  return (
    <main>
      <Container className="py-8">
        <SectionError what="this week's games">
          <Suspense fallback={<ThisWeekSkeleton />}>
            <ThisWeekView />
          </Suspense>
        </SectionError>
      </Container>
    </main>
  );
}

async function ThisWeekView() {
  const [rows, situations, teams, latest] = await Promise.all([getThisWeek(), getSituations(), getTeams(), getLatestSeason()]);
  if (rows.length === 0 || latest === null) {
    return (
      <>
        <h1 className="text-3xl font-bold tracking-tight">This week</h1>
        <p className="mt-3 text-ink-2">No games scheduled yet. The next season&apos;s schedule usually comes out in May.</p>
      </>
    );
  }

  const [from, to] = defaultRange(latest);
  const range = { from, to, playoffs: false, with2020: false };
  const [teamSums, seasonSums] = await Promise.all([
    getSplitSums(range, ["REG"]),
    getSeasonLeagueSums([...FEATURED_GAME_KEYS, ...FEATURED_TEAM_KEYS, "venue"], ...EFFECT_SEASONS),
  ]);
  const effects = featuredEffects(seasonSums);
  const week = buildThisWeek({
    rows,
    situations,
    effects,
    teamSums,
    allTeams: teams.map((t) => t.abbr),
    span: `${from}–${String(to).slice(2)}`,
    rangeQuery: "",
    exclude2020: includes2020(range),
  })!;
  const teamsByAbbr = new Map(teams.map((t) => [t.abbr, t]));

  const heavyRain = effects.get(effectId("precipitation", "heavy_rain"));
  const wind = effects.get(effectId("wind", "15_plus"));
  const pts = (e: typeof heavyRain) => (e?.kind === "points" ? Math.round(Math.abs(e.effect.value)) : null);

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{week.title}</h1>
      <p className="mt-1 text-ink-2">{week.dates}</p>
      <div className="mt-3 max-w-[72ch] space-y-1 text-sm text-ink-2">
        <p>
          Each game with the situations both teams face. ★ marks the situations that measurably changed results across every
          game from 1999 to 2025; under each, the team&apos;s own record and best estimate over {from}–{to}.
        </p>
        {pts(heavyRain) !== null && pts(wind) !== null && (
          <p>
            Weather forecasts aren&apos;t shown yet. For reference, heavy rain has cost about {pts(heavyRain)} points a game and
            15+ mph wind about {pts(wind)} ({EFFECT_SEASONS[0]}–{EFFECT_SEASONS[1]}).
          </p>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-4">
        {week.games.map((g) => (
          <GameCard key={g.gameId} game={g} teams={teamsByAbbr} />
        ))}
      </div>
      {week.byes.length > 0 && (
        <p className="mt-6 text-sm text-ink-2">
          On a bye: {week.byes.map((t) => teamsByAbbr.get(t)?.name ?? t).join(", ")}.
        </p>
      )}
    </>
  );
}
