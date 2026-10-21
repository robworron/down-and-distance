import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // The app's "@/..." imports (tsconfig paths).
      { find: /^@\//, replacement: root },
      // queries.ts is imported to render SQL; nothing connects to a database.
      { find: /^server-only$/, replacement: `${root}lib/__tests__/stubs/server-only.ts` },
    ],
  },
});
