import Link from "next/link";
import { Suspense } from "react";

import { Container } from "@/components/container";
import { MobileNav } from "@/components/mobile-nav";
import { NavLinks, NavLinksFallback } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b bg-card">
      <Container className="flex h-[52px] items-center gap-6">
        <Link href="/" className="font-semibold tracking-tight text-foreground no-underline">
          Down &amp; Distance
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          {/* The current path is only known per request, so the links that
              mark it stream in; the shell shows the same links unmarked. */}
          <Suspense fallback={<NavLinksFallback className="flex gap-5 text-sm" />}>
            <NavLinks className="flex gap-5 text-sm" />
          </Suspense>
        </nav>
        <div className="ml-auto flex gap-2">
          <MobileNav />
          <ThemeToggle />
        </div>
      </Container>
    </header>
  );
}
