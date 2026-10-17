# Parking lot

Ideas for later. Not part of the current step.

- **npm audit: 5 high-severity findings in the lint toolchain (2026-10-17).** All sit under `eslint-config-next` 16.4.1 (`@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`, advisory GHSA-vfj7-8cjw-p6xm, a denial of service via deeply nested glob patterns). They are dev-only: `npm audit --omit=dev` finds 0 vulnerabilities, so nothing ships to the site. npm's only fix is downgrading `eslint-config-next` to 14.x, which would break linting. Recheck when Next publishes a patched `eslint-config-next`, at the latest in Phase 7.
