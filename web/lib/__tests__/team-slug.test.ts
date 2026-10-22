import { describe, expect, it } from "vitest";

import TEAM_CODES from "../team-codes.json";
import { parseTeamSlug } from "../team-slug";

describe("team-codes.json", () => {
  it("lists 32 distinct upper-case codes", () => {
    expect(TEAM_CODES).toHaveLength(32);
    expect(new Set(TEAM_CODES).size).toBe(32);
    for (const code of TEAM_CODES) expect(code).toMatch(/^[A-Z]{2,3}$/);
  });
});

describe("parseTeamSlug", () => {
  it("accepts a team's lower-case code and looks it up in upper case", () => {
    expect(parseTeamSlug("buf")).toEqual({ kind: "ok", abbr: "BUF" });
    expect(parseTeamSlug("kc")).toEqual({ kind: "ok", abbr: "KC" });
  });

  it("accepts every listed code", () => {
    for (const code of TEAM_CODES) expect(parseTeamSlug(code.toLowerCase())).toEqual({ kind: "ok", abbr: code });
  });

  it("redirects other casings of a team's code to the lower-case URL", () => {
    expect(parseTeamSlug("BUF")).toEqual({ kind: "redirect", slug: "buf" });
    expect(parseTeamSlug("Buf")).toEqual({ kind: "redirect", slug: "buf" });
    expect(parseTeamSlug("kC")).toEqual({ kind: "redirect", slug: "kc" });
  });

  it("rejects codes that aren't a team, in any casing", () => {
    for (const slug of ["xyz", "XYZ", "oak", "SD", "b-u-f", "", "b", "buff", "bu1", "büf", "buf "]) {
      expect(parseTeamSlug(slug)).toEqual({ kind: "notFound" });
    }
  });
});
