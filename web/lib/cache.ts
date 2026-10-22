// How the marts are cached. Every query in lib/queries.ts starts with
//
//   "use cache";
//   martsCache();
//
// so all of them share one lifetime (the `marts` profile in next.config.ts)
// and one tag. POST /api/revalidate expires the tag after the nightly dbt
// build, and the next visit to each page reads the new data.

import { cacheLife, cacheTag } from "next/cache";

/** The tag on every cached marts query; the refresh route expires it. */
export const MARTS_TAG = "marts";

/** Give the enclosing "use cache" scope the marts lifetime and tag. */
export function martsCache() {
  cacheLife("marts");
  cacheTag(MARTS_TAG);
}
