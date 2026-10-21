import Link from "next/link";

import { Container } from "@/components/container";

// A plain not-found page inside the site layout; step 1.4 adds the polish.
export default function NotFound() {
  return (
    <main>
      <Container className="py-16">
        <p className="text-sm font-semibold text-muted-foreground">404</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-ink-2">That page doesn&apos;t exist, or not yet.</p>
        <p className="mt-6">
          <Link href="/">Back to the home page</Link>
        </p>
      </Container>
    </main>
  );
}
