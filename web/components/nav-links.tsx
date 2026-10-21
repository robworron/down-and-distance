"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_LINKS } from "@/lib/nav";

/** The nav links, with the current section marked for sighted and screen-reader users. */
export function NavLinks({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {NAV_LINKS.map(({ href, label }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={current ? "page" : undefined}
              className={cn(
                "text-ink-2 no-underline hover:text-foreground",
                current && "font-semibold text-foreground",
              )}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Rendered while the current path is unknown (in the prerendered shell). */
export function NavLinksFallback({ className }: { className?: string }) {
  return (
    <ul className={className}>
      {NAV_LINKS.map(({ href, label }) => (
        <li key={href}>
          <Link href={href} className="text-ink-2 no-underline hover:text-foreground">
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
