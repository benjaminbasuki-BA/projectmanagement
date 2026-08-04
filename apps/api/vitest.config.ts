import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // PGlite migration bootstrap (createTestDb) is a bit slower than a
    // unit test, and hookTimeout doesn't inherit testTimeout — it has its
    // own 10s default regardless, so beforeAll/beforeEach need it set
    // explicitly too or they time out under load (many suites bootstrapping
    // PGlite concurrently).
    testTimeout: 20000,
    hookTimeout: 20000,
    // Vitest's default excludes don't cover this project's own build
    // output. Without it, a stray `dist/` from a prior `tsc` run gets
    // picked up as a second copy of every *.test.ts file — doubling
    // concurrent PGlite bootstraps and starving the real ones into
    // beforeAll timeouts (not a flaky test, a duplicate one).
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
