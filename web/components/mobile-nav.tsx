"use client";

import { MenuIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { NavLinks, NavLinksFallback } from "@/components/nav-links";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** On phones the nav moves into a sheet that slides in from the right. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="border-input md:hidden" aria-label="Open menu">
          <MenuIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-64 p-6">
        <SheetTitle>Down &amp; Distance</SheetTitle>
        <SheetDescription className="sr-only">Site navigation</SheetDescription>
        <nav aria-label="Main">
          <Suspense fallback={<NavLinksFallback className="flex flex-col gap-4 text-base" />}>
            <NavLinks className="flex flex-col gap-4 text-base" onNavigate={() => setOpen(false)} />
          </Suspense>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
