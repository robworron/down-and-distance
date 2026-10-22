// Status-code check against a running site: team URLs (Proxy) and the
// routes Proxy must leave alone. Exits 1 if any answer differs.
//
//   npm run check:status -- http://localhost:3001
//   npm run check:status -- https://down-and-distance-chi.vercel.app

const base = (process.argv[2] ?? "http://localhost:3001").replace(/\/$/, "");

// [path, status, where a redirect must point (path and query), text the body must contain]
const CASES = [
  ["/teams/buf", 200],
  ["/teams/kc", 200],
  ["/teams/buf?from=2016&to=2025", 200],
  ["/teams/BUF", 308, "/teams/buf"],
  ["/teams/Kc", 308, "/teams/kc"],
  ["/teams/BUF?from=2020&to=2022&playoffs=1", 308, "/teams/buf?from=2020&to=2022&playoffs=1"],
  // The site's 404 page inside its layout. (Its "No team with that code"
  // heading is filled in from the URL in the browser, so it isn't in the HTML.)
  ["/teams/xyz", 404, null, ["All 32 teams", 'href="/teams/buf"', 'name="robots" content="noindex"', "<header"]],
  ["/teams/XYZ", 404],
  ["/teams/oak", 404],
  ["/teams/b-u-f", 404],
  ["/teams/xyz?from=2020", 404],
  ["/teams/buf/extra", 404],
  ["/nope", 404, null, ["Page not found", "<header"]],
  ["/", 200],
  ["/teams", 200],
  ["/explorer", 200],
  ["/leaderboards", 200],
  ["/this-week", 200],
];

let failed = 0;
for (const [path, status, location, texts = []] of CASES) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  const problems = [];
  if (res.status !== status) problems.push(`status ${res.status}, expected ${status}`);
  if (location) {
    const to = res.headers.get("location");
    const got = to ? new URL(to, base) : null;
    if (!got || `${got.pathname}${got.search}` !== location) problems.push(`location ${to}, expected ${location}`);
  }
  if (texts.length > 0) {
    const body = await res.text();
    for (const text of texts) if (!body.includes(text)) problems.push(`body lacks ${JSON.stringify(text)}`);
  } else {
    await res.body?.cancel();
  }
  if (problems.length > 0) failed++;
  console.log(`${problems.length ? "FAIL" : "ok  "}  ${res.status}  ${path}${location ? `  -> ${res.headers.get("location")}` : ""}${problems.length ? `  (${problems.join("; ")})` : ""}`);
}

console.log(failed ? `\n${failed} of ${CASES.length} checks failed against ${base}` : `\nAll ${CASES.length} checks passed against ${base}`);
process.exit(failed ? 1 : 0);
