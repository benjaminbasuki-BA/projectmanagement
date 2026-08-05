import { defineConfig, devices } from "@playwright/test";

/**
 * doc06 §1 (Testing row), doc11 "MVP completion" — the walking-skeleton
 * Playwright suite for the core loop (edit, panel, drag). Runs against
 * the real API on the in-memory PGlite dev server (apps/api/dev:pglite)
 * — same harness as `pnpm dev:pglite` for manual local testing, not a
 * mock.
 *
 * `workers: 1`: every spec shares one live PGlite process (see
 * global-setup.ts) rather than each getting an isolated database, so
 * specs must not run concurrently against overlapping data. Each spec
 * in this suite targets a different seeded board specifically so they
 * don't collide even under this constraint.
 */
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pnpm --filter api dev:pglite",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
