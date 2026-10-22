import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Container } from "@/components/container";
import { SectionError } from "@/components/section-error";
import { TeamsIndexSkeleton } from "@/components/skeletons";
import { TeamBadge } from "@/components/team-badge";
import { getTeams, type Team } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Teams",
  description: "All 32 teams by conference and division.",
};

export default function TeamsPage() {
  return (
    <main>
      <Container className="py-8">
        <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
        <p className="mt-2 text-ink-2">Pick a team to see its record and how it does in each situation.</p>
        <SectionError what="the teams">
          <Suspense fallback={<TeamsIndexSkeleton />}>
            <TeamsByDivision />
          </Suspense>
        </SectionError>
      </Container>
    </main>
  );
}

async function TeamsByDivision() {
  // Read at request time for now; step 1.5 caches it.
  await connection();
  const teams = await getTeams();

  // getTeams returns league order, so grouping keeps it: AFC before NFC,
  // East, North, South, West within each.
  const conferences = Map.groupBy(teams, (t) => t.conference);

  return (
    <div className="mt-8 grid gap-10 md:grid-cols-2 md:gap-8">
      {[...conferences].map(([conference, confTeams]) => (
        <section key={conference} aria-labelledby={`conf-${conference}`}>
          <h2 id={`conf-${conference}`} className="text-xl font-semibold">
            {conference}
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {[...Map.groupBy(confTeams, (t) => t.division)].map(([division, divTeams]) => (
              <Division key={division} name={division.replace(`${conference} `, "")} teams={divTeams} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Division({ name, teams }: { name: string; teams: Team[] }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <h3 className="px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">{name}</h3>
      <ul className="mt-2 grid gap-1">
        {teams.map((t) => (
          <li key={t.abbr}>
            <Link
              href={`/teams/${t.abbr.toLowerCase()}`}
              className="flex items-center gap-3 rounded-md p-1 text-foreground no-underline hover:bg-accent"
            >
              <TeamBadge abbr={t.abbr} color={t.color} />
              <span className="font-medium">{t.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
