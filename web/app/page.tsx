import Link from "next/link";

import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main>
      <Container className="py-12">
        <h1 className="text-3xl font-bold tracking-tight">Down &amp; Distance</h1>
        <p className="mt-3 max-w-[60ch] text-ink-2">
          How every NFL team does in specific situations (rain, wind, a dome, a short week, a trip across time zones), compared with
          the rest of the league, with the number of games behind every figure so small samples are obvious.
        </p>
        <Button asChild className="mt-6">
          <Link href="/teams" className="no-underline">
            Browse teams
          </Link>
        </Button>
      </Container>
    </main>
  );
}
