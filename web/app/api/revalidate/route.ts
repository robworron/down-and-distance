// POST /api/revalidate: the nightly job calls this after the dbt build
// (`uv run python -m pipeline refresh`). It expires every cached marts query
// at once, so the next visit to each page renders with the new data.
//
// Only POST is exported, so any other method gets a 405. Nothing is logged,
// and the secret only ever travels in the Authorization header.

import { revalidateTag } from "next/cache";

import { MARTS_TAG } from "@/lib/cache";
import { checkRefreshAuth } from "@/lib/refresh-auth";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const auth = checkRefreshAuth(request.headers.get("authorization"), process.env.REVALIDATE_SECRET);
  // No secret on the server: refuse everyone, and say it's the server's fault.
  if (auth === "unconfigured") return new Response(null, { status: 503, headers: NO_STORE });
  // Wrong or missing secret: no detail about which.
  if (auth === "unauthorized") return new Response(null, { status: 401, headers: NO_STORE });

  // { expire: 0 }: no stale copy is served afterwards; the next request for a
  // page waits for fresh data (a route handler can't use updateTag). Pages
  // re-render as they're visited, not all at once here.
  revalidateTag(MARTS_TAG, { expire: 0 });
  return Response.json({ revalidated: true, at: new Date().toISOString() }, { headers: NO_STORE });
}
