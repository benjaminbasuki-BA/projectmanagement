import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    // Pings through the injected app.db (server.ts) rather than importing
    // db/client.ts directly — so this reports on whichever database the
    // server is actually running against (real Postgres in dev/prod,
    // PGlite under dev:pglite/tests), and importing this route doesn't
    // drag in a postgres-js connection as a side effect.
    let dbConnected: boolean;
    try {
      await app.db.execute(sql`select 1`);
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    return reply.status(dbConnected ? 200 : 503).send({
      status: dbConnected ? ("ok" as const) : ("degraded" as const),
      timestamp: new Date().toISOString(),
      db: dbConnected ? ("connected" as const) : ("unreachable" as const),
    });
  });
}
