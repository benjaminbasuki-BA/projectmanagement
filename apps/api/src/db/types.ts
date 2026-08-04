import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema/index.js";

/**
 * Driver-agnostic db type — satisfied by both the real runtime
 * (drizzle-orm/postgres-js, in client.ts) and the Vitest test harness
 * (drizzle-orm/pglite, in test/db.ts), so route/service code doesn't
 * care which one it's handed.
 */
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;
