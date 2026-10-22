// Team URLs are checked here, before any page renders. A page can't set its
// own status code under this app's settings: in Next 16.4.1 the team route's
// response went out as 200 whatever it did, notFound() included
// (docs/decisions.md, "Team URLs checked in Proxy"). Proxy runs only for
// /teams/<one segment> (the matcher below) and needs no database: the codes
// come from lib/team-codes.json.

import { NextResponse, type NextRequest } from "next/server";

import { parseTeamSlug } from "@/lib/team-slug";

/**
 * Where an unknown team code is rewritten. It matches no route on purpose:
 * Next.js answers an unmatched path with app/not-found.tsx, inside the site
 * layout, with a real 404. (A rewrite to a real page keeps that page's 200,
 * even with `status: 404`.)
 */
export const NO_SUCH_TEAM = "/teams/__no-such-team/404";

export function proxy(request: NextRequest) {
  const slug = parseTeamSlug(teamSegment(request.nextUrl.pathname));
  if (slug.kind === "ok") return NextResponse.next();
  if (slug.kind === "redirect") {
    // Same URL with the code in lower case; the query string is kept.
    const url = request.nextUrl.clone();
    url.pathname = `/teams/${slug.slug}`;
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.rewrite(new URL(NO_SUCH_TEAM, request.url));
}

/** The code in /teams/<code>, decoded; "" if it can't be decoded. */
function teamSegment(pathname: string): string {
  try {
    return decodeURIComponent(pathname.slice("/teams/".length));
  } catch {
    return "";
  }
}

export const config = {
  // Exactly one segment under /teams: not /teams itself, deeper paths, API
  // routes, pages or assets.
  matcher: "/teams/:team",
};
