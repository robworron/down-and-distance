"use client";

import "./globals.css";

// The last resort: an error in the root layout itself. It replaces the whole
// document, so it brings its own <html>, <body> and styles, and can't use the
// site header or theme. Like app/error.tsx, it shows no error detail.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-background text-foreground">
        <title>Something went wrong · Down &amp; Distance</title>
        <main className="mx-auto w-full max-w-[1180px] px-4 py-16">
          <p className="font-semibold">Down &amp; Distance</p>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Something went wrong</h1>
          <p className="mt-2 max-w-[60ch] text-ink-2">The site couldn&apos;t be loaded. Try again, or come back in a minute.</p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => retry()}
              className="h-8 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
            {/* A plain link: a full page load, since the app itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- client navigation needs the app that just failed */}
            <a href="/">Back to the home page</a>
          </div>
        </main>
      </body>
    </html>
  );
}
