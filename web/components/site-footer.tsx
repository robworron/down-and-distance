import { Suspense } from "react";

import { Container } from "@/components/container";
import { DataUpdated } from "@/components/data-updated";
import { SectionError } from "@/components/section-error";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t py-5 text-xs text-muted-foreground">
      <Container className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          Data: <a href="https://nflverse.nflverse.com/">nflverse</a>
        </span>
        <span>
          Weather data by <a href="https://open-meteo.com/">Open-Meteo.com</a> (
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)
        </span>
        <span>Not affiliated with the NFL</span>
        <span>Analysis, not betting advice</span>
        {/* Cached with the marts, so it's in every static shell and moves with the nightly refresh. */}
        <SectionError what="the update time" quiet>
          <Suspense fallback={null}>
            <DataUpdated />
          </Suspense>
        </SectionError>
      </Container>
    </footer>
  );
}
