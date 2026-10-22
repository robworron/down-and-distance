// Loading placeholders, each the size of what it stands in for, so nothing
// jumps when the data streams in. They're hidden from screen readers; the
// region they sit in says it's loading instead (aria-busy).

import { cn } from "cn";

import { Container } from "@/components/container";
import { Skeleton } from "@/components/ui/skeleton";

/** A loading region: announced once as busy, its placeholders hidden. */
function Loading({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** A situation card: header lines, then table rows. */
function SituationCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="px-4 pt-3.5 pb-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-[36rem]" />
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <Skeleton className="h-7 w-full" />
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

/** The team page's header band. */
function TeamHeaderSkeleton() {
  return (
    <div className="border-t border-b-[5px] border-t-rule-strong bg-secondary">
      <Container className="py-5 md:py-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-9 w-64 md:h-10" />
        <div className="mt-3.5 flex flex-wrap gap-5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-28" />
          ))}
        </div>
      </Container>
    </div>
  );
}

/** The range bar, four headline figures and the situation cards. */
function TeamRangeParts() {
  return (
    <>
      <div className="border-b">
        <Container className="py-2.5">
          <Skeleton className="h-8 w-full max-w-[40rem]" />
        </Container>
      </div>
      <Container>
        <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 py-5 sm:flex sm:gap-8">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <Skeleton className="h-7 w-20" />
              <Skeleton className="mt-1 h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-5">
          <Skeleton className="h-4 w-full max-w-[44rem]" />
          <SituationCardSkeleton />
          <SituationCardSkeleton rows={4} />
          <SituationCardSkeleton />
        </div>
      </Container>
    </>
  );
}

/** The whole team page, before the team is known. */
export function TeamPageSkeleton() {
  return (
    <Loading label="Loading the team page">
      <TeamHeaderSkeleton />
      <TeamRangeParts />
    </Loading>
  );
}

/** The part of a team page that reads the season range. */
export function TeamRangeSkeleton() {
  return (
    <Loading label="Loading these seasons' figures">
      <TeamRangeParts />
    </Loading>
  );
}

/** The teams index: two conferences of four division cards. */
export function TeamsIndexSkeleton() {
  return (
    <Loading label="Loading the teams" className="mt-8 grid gap-10 md:grid-cols-2 md:gap-8">
      {Array.from({ length: 2 }, (_, c) => (
        <div key={c}>
          <Skeleton className="h-7 w-16" />
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, d) => (
              <div key={d} className="rounded-lg border bg-card p-3">
                <Skeleton className="h-3 w-12" />
                <div className="mt-2 grid gap-1">
                  {Array.from({ length: 4 }, (_, t) => (
                    <div key={t} className="flex items-center gap-3 p-1">
                      <Skeleton className="size-10" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Loading>
  );
}

/** The explorer: the filter column, then the result cards. */
export function ExplorerSkeleton() {
  return (
    <Loading label="Loading the explorer" className="mt-6 grid gap-8 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <div className="order-2 flex flex-col gap-3 lg:order-1">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <div className="order-1 flex flex-col gap-4 lg:order-2">
        <Skeleton className="h-4 w-56" />
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-4 w-64" />
            <div className="mt-4 grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }, (_, j) => (
                <div key={j}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-1.5 h-7 w-20" />
                  <Skeleton className="mt-1 h-3 w-24" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-4 h-4 w-full" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** The leaderboard: its form, the board's title, then a header row and one row per team. */
export function LeaderboardSkeleton({ rows = 32 }: { rows?: number }) {
  return (
    <Loading label="Loading the leaderboard" className="mt-4">
      <div className="border-b py-3">
        <Skeleton className="h-8 w-full max-w-[44rem]" />
      </div>
      <Skeleton className="mt-6 h-6 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-[40rem]" />
      <div className="mt-3 overflow-hidden rounded-lg border bg-card">
        <Skeleton className="h-9 w-full rounded-none" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={cn("flex items-center gap-3 px-3 py-1.5", i > 0 && "border-t")}>
            <Skeleton className="h-4 w-6" />
            <Skeleton className="size-7" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-4 w-40" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** This week: a heading line and a grid of game cards. */
export function ThisWeekSkeleton() {
  return (
    <Loading label="Loading this week's games">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-2 h-5 w-48" />
      <Skeleton className="mt-3 h-4 w-full max-w-[44rem]" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="ml-auto size-10" />
            </div>
            <Skeleton className="mt-3 h-4 w-48" />
            <div className="mt-4 flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}
