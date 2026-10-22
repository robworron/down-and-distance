import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Container } from "@/components/container";
import { NotFoundHeading, NotFoundHeadingFallback } from "@/components/not-found-heading";
import TEAM_CODES from "@/lib/team-codes.json";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page doesn't exist. Every team's page is linked from here.",
};

// The site's one 404 page: unknown URLs, and unknown team codes, which Proxy
// rewrites here so they keep a real 404 status (proxy.ts). It reads no data:
// this page is part of every route, and a query here would make even the
// home page query the database on each visit.
export default function NotFound() {
  return (
    <main>
      <Container className="py-16">
        <p className="text-sm font-semibold text-muted-foreground">404</p>
        <Suspense fallback={<NotFoundHeadingFallback />}>
          <NotFoundHeading />
        </Suspense>
        <p className="mt-2 max-w-[60ch] text-ink-2">
          Team pages use the team&apos;s code, like <Link href="/teams/buf">/teams/buf</Link>. Pick one below, see{" "}
          <Link href="/teams">every team by division</Link>, or go to the <Link href="/">home page</Link>.
        </p>
        <nav aria-labelledby="all-teams" className="mt-10">
          <h2 id="all-teams" className="text-lg font-semibold">
            All 32 teams
          </h2>
          <ul className="mt-3 flex max-w-[44rem] flex-wrap gap-2">
            {[...TEAM_CODES].sort().map((code) => (
              <li key={code}>
                <Link
                  href={`/teams/${code.toLowerCase()}`}
                  className="inline-grid h-9 min-w-12 place-items-center rounded-md border bg-card px-2 text-sm font-semibold text-foreground no-underline hover:bg-accent"
                >
                  {code}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </main>
  );
}
