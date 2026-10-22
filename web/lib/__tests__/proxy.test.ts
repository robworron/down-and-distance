import { getRedirectUrl, getRewrittenUrl, isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, NO_SUCH_TEAM, proxy } from "../../proxy";

const SITE = "https://example.test";
const run = (path: string) => proxy(new NextRequest(`${SITE}${path}`));
const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("which requests Proxy sees", () => {
  it("runs on one segment under /teams", () => {
    for (const url of ["/teams/buf", "/teams/BUF", "/teams/xyz", "/teams/b-u-f", "/teams/buf?from=2020"]) expect(matches(url)).toBe(true);
  });

  it("leaves every other route alone", () => {
    for (const url of [
      "/",
      "/teams",
      "/teams/buf/extra",
      "/explorer",
      "/leaderboards",
      "/this-week",
      "/api/revalidate",
      "/_next/static/chunks/app.js",
      "/favicon.ico",
      "/nope",
    ]) {
      expect(matches(url)).toBe(false);
    }
  });
});

describe("proxy", () => {
  it("lets a team's lower-case URL through", () => {
    const res = run("/teams/buf?from=2016&to=2025");
    expect(isRewrite(res)).toBe(false);
    expect(getRedirectUrl(res)).toBeNull();
    // NextResponse.next() marks "carry on" with this header.
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("sends other casings to the lower-case URL with a 308, keeping the query string", () => {
    const res = run("/teams/BUF?from=2020&to=2022&playoffs=1");
    expect(res.status).toBe(308);
    expect(getRedirectUrl(res)).toBe(`${SITE}/teams/buf?from=2020&to=2022&playoffs=1`);
    expect(getRedirectUrl(run("/teams/Kc"))).toBe(`${SITE}/teams/kc`);
  });

  it("rewrites anything that isn't a team to the 404 path, any casing, query string or not", () => {
    for (const path of ["/teams/xyz", "/teams/XYZ", "/teams/oak", "/teams/b-u-f", "/teams/buff", "/teams/xyz?from=2020", "/teams/%E0%A4%A"]) {
      const res = run(path);
      expect(isRewrite(res), path).toBe(true);
      expect(new URL(getRewrittenUrl(res)!).pathname, path).toBe(NO_SUCH_TEAM);
    }
  });

  it("rewrites to a path no route matches, so Next.js answers with app/not-found.tsx and a 404", () => {
    // /teams/[team] is a single segment; the 404 path has two under /teams.
    expect(NO_SUCH_TEAM.split("/").filter(Boolean).length).toBeGreaterThan(2);
    expect(matches(NO_SUCH_TEAM)).toBe(false);
  });
});
