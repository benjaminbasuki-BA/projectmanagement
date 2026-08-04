import { buildServer } from "./server.js";
import { env } from "./config/env.js";
import { db } from "./db/client.js";

/**
 * Entrypoint for the `api` process (docs/03-backend-architecture.md §1).
 * `ws-gateway` and `worker` entrypoints are added alongside the real-time
 * and background-job features that need them — not part of scaffolding.
 */
async function main() {
  const app = await buildServer(db);

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`api listening on http://localhost:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
