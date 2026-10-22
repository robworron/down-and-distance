"use client";

import { catchError, type ErrorInfo } from "next/error";

import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";

/**
 * An error boundary for one streamed section: if its query fails, this
 * message replaces the section and the rest of the page still renders.
 * "Try again" re-fetches the section from the server. notFound() and
 * redirects pass straight through (catchError leaves them to Next.js).
 *
 * Wrap it outside the section's <Suspense>, so it catches what the section
 * throws while streaming. `contained` puts the message in the content column,
 * for a section that spans the page's full width (the team page); `quiet` is
 * one muted line with no button, for a small detail like the footer's stamp.
 */
function SectionErrorFallback(
  { what = "this section", contained = false, quiet = false }: { what?: string; contained?: boolean; quiet?: boolean },
  { retry }: ErrorInfo,
) {
  if (quiet) return <span role="status">Couldn&apos;t load {what}.</span>;
  const message = (
    <div role="alert" className="my-4 rounded-lg border bg-card p-4 text-sm">
      <p className="font-medium text-foreground">Couldn&apos;t load {what}.</p>
      <p className="mt-1 text-ink-2">It&apos;s usually a brief hiccup. Try again in a moment.</p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
  return contained ? <Container className="py-4">{message}</Container> : message;
}

export const SectionError = catchError(SectionErrorFallback);
