import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { drizzle } from "drizzle-orm/pglite";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import * as schema from "../db/schema/index.js";
import type { AppDb } from "../db/types.js";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");

/**
 * Real Postgres (compiled to WASM), migrated with the actual migration
 * files in apps/api/drizzle/ — not a mock, not a hand-maintained parallel
 * schema. Same approach used to verify the migrations themselves apply
 * cleanly in the previous task.
 *
 * After migrating (as the bootstrap superuser, same as docker-compose's
 * POSTGRES_USER in real dev/prod), switches to `SET ROLE app_user` so
 * RLS policies are genuinely enforced in tests — PGlite's default role
 * is a superuser, which Postgres exempts from RLS by default, same as
 * the real deployment's table-owner role (see drizzle/0002's comment).
 */
export async function createTestDb(): Promise<AppDb> {
  const pglite = new PGlite({ extensions: { citext } });
  await pglite.waitReady;

  const files = (await readdir(drizzleDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sqlText = await readFile(path.join(drizzleDir, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const s = statement.trim();
      if (s) await pglite.exec(s);
    }
  }

  await pglite.exec("SET ROLE app_user;");

  return drizzle(pglite, { schema });
}
