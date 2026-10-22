"use client";

import { usePathname } from "next/navigation";

/**
 * The not-found page's heading. Proxy sends every unknown /teams/<code> here
 * as a 404, and the browser's URL still says /teams/<code>, so the heading
 * can say what was missing.
 */
export function NotFoundHeading() {
  const team = usePathname().startsWith("/teams/");
  return <h1 className="mt-1 text-2xl font-bold tracking-tight">{team ? "No team with that code" : "Page not found"}</h1>;
}

/** Rendered before the path is known (in the prerendered page). */
export function NotFoundHeadingFallback() {
  return <h1 className="mt-1 text-2xl font-bold tracking-tight">Page not found</h1>;
}
