"use client";

import Link from "next/link";

import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";

// The page-level error boundary: a page that fails outside its own section
// boundaries (SectionError) lands here, inside the site layout. No error
// detail is shown: the server logs it, and raw database messages never
// reach the page.
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main>
      <title>Something went wrong · Down &amp; Distance</title>
      <Container className="py-16">
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-2 max-w-[60ch] text-ink-2">
          This page couldn&apos;t be loaded. It&apos;s usually a brief hiccup: try again, or come back in a minute.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <Link href="/">Back to the home page</Link>
        </div>
      </Container>
    </main>
  );
}
