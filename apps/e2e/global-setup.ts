import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Runs after both webServer entries (playwright.config.ts) report
 * healthy, before any test file. Reuses the same dev/seed.mjs script
 * used for manual local testing — it signs in as dev@trellis.local
 * (matching router.tsx's DEV_AUTH_BYPASS) and creates the org/boards
 * every spec file navigates to, over plain HTTP, so there's exactly
 * one source of seed data instead of a second copy just for e2e.
 */
export default function globalSetup() {
  const seedScript = path.resolve(__dirname, "../api/src/dev/seed.mjs");
  execFileSync(process.execPath, [seedScript], { stdio: "inherit" });
}
