import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // One lifetime for everything read from the marts (lib/cache.ts). The data
  // changes once a night, after the dbt build, and the nightly job then calls
  // POST /api/revalidate, which expires every entry at once.
  cacheLife: {
    marts: {
      stale: 300, // a browser reuses a page's data for up to 5 minutes without asking the server
      revalidate: 86_400, // after a day, the next visit is served the cached copy while a fresh one renders: the safety net if a nightly refresh is missed
      expire: 31_536_000, // a page left idle for a year renders fresh on its next visit instead
    },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
