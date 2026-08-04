import { sql } from "drizzle-orm";
import type { AppDb } from "./types.js";

/**
 * The app-layer half of tenancy (docs/03-backend-architecture.md §4):
 * every tenant-scoped query runs inside a transaction that first sets
 * `app.org_id` for the duration of that transaction, which the RLS
 * policies in drizzle/0004_rls_policies.sql read via
 * `current_setting('app.org_id', true)`.
 *
 * SET LOCAL only affects the current transaction — never reused across
 * pooled connections — which is why this always wraps a transaction
 * rather than setting it on a raw (potentially pooled/reused) connection.
 *
 * This is the "app-layer" enforcement; RLS is the second, independent
 * layer. A bug in one doesn't expose cross-tenant data unless the other
 * has the same bug too (03 §4: "a cross-tenant leak now needs two
 * independent bugs").
 */
export async function withTenantContext<T>(
  db: AppDb,
  orgId: string,
  fn: (tx: AppDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config() (rather than the `SET LOCAL app.org_id = ...` DDL
    // form) accepts a normal bound query parameter, so orgId goes
    // through the driver's parameterization instead of string
    // interpolation.
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx as AppDb);
  });
}
