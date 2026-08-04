import { createTestDb } from "../test/db.js";
import { buildServer } from "../server.js";
import { env } from "../config/env.js";

/**
 * Runs the real API against an in-process PGlite Postgres (same harness
 * the test suite uses — real migrations, RLS enforced via SET ROLE
 * app_user) instead of the Docker Postgres from docker-compose.yml.
 *
 * Useful for frontend development without Docker: `pnpm dev:pglite`.
 * Data is in-memory and lost on restart — this is a dev convenience,
 * not a persistence mode.
 */
const db = await createTestDb();
const app = await buildServer(db);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
app.log.info(
  `api (PGlite in-memory) listening on http://localhost:${env.PORT}`,
);
