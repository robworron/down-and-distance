// What a /teams/[team] URL segment means. Proxy (proxy.ts) decides this
// before the page renders, so the response can be a real 404 or 308; the page
// checks again as a fallback.
//
// The 32 codes live in team-codes.json, the one copy of the list in the web
// app. A data check (pipeline/tests/test_raw_data.py) compares it with
// marts.dim_teams, so a renamed or moved team can't drift out of step.

import TEAM_CODES from "./team-codes.json";

const CODES: ReadonlySet<string> = new Set(TEAM_CODES);

export type TeamSlug =
  /** A team's lower-case code ("buf"): show the team "BUF". */
  | { kind: "ok"; abbr: string }
  /** A team's code in other casing ("BUF", "Buf"): send it to the lower-case URL. */
  | { kind: "redirect"; slug: string }
  /** Not a team ("xyz", "b-u-f", ""): not found. */
  | { kind: "notFound" };

export function parseTeamSlug(slug: string): TeamSlug {
  const abbr = slug.toUpperCase();
  if (!CODES.has(abbr)) return { kind: "notFound" };
  const lower = slug.toLowerCase();
  return slug === lower ? { kind: "ok", abbr } : { kind: "redirect", slug: lower };
}
