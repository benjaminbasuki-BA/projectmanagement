import { beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import { createTestDb } from "../test/db.js";
import { withTenantContext } from "./tenant-db.js";
import { organizations, workspaces, users } from "./schema/index.js";
import type { AppDb } from "./types.js";

/**
 * Tests the RLS layer specifically, independent of the app-layer WHERE
 * clauses the route handlers also add (workspaces/routes.ts) — proving
 * the "defense in depth" claim in docs/03-backend-architecture.md §4 is
 * actually true, not just that the API happens to filter correctly.
 */
describe("RLS enforcement (db layer, no app-layer filtering)", () => {
  let db: AppDb;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    db = await createTestDb();

    orgAId = uuidv7();
    orgBId = uuidv7();

    await withTenantContext(db, orgAId, (tx) =>
      tx.insert(organizations).values({
        id: orgAId,
        name: "Org A",
        slug: "rls-org-a",
      }),
    );
    await withTenantContext(db, orgBId, (tx) =>
      tx.insert(organizations).values({
        id: orgBId,
        name: "Org B",
        slug: "rls-org-b",
      }),
    );

    // users isn't RLS-protected (not tenant-scoped, see 0004's header
    // comment) — inserted directly. workspaces.created_by is a real FK
    // to users.id, so these need to be real rows, not bare uuidv7()s.
    const [userA] = await db
      .insert(users)
      .values({ email: "rls-user-a@test.dev", name: "RLS User A" })
      .returning({ id: users.id });
    const [userB] = await db
      .insert(users)
      .values({ email: "rls-user-b@test.dev", name: "RLS User B" })
      .returning({ id: users.id });

    await withTenantContext(db, orgAId, (tx) =>
      tx.insert(workspaces).values({
        orgId: orgAId,
        name: "Org A Workspace",
        type: "open",
        position: "a0",
        createdBy: userA.id,
      }),
    );
    await withTenantContext(db, orgBId, (tx) =>
      tx.insert(workspaces).values({
        orgId: orgBId,
        name: "Org B Workspace",
        type: "open",
        position: "a0",
        createdBy: userB.id,
      }),
    );
  });

  it("returns only the scoped org's rows even with no WHERE clause at all", async () => {
    // No .where(eq(workspaces.orgId, ...)) anywhere here — if this only
    // returns Org A's workspace, that's RLS doing it, not app code.
    const rows = await withTenantContext(db, orgAId, (tx) =>
      tx.select({ name: workspaces.name }).from(workspaces),
    );

    expect(rows.map((r) => r.name)).toEqual(["Org A Workspace"]);
  });

  it("switches which rows are visible when the tenant context changes", async () => {
    const rows = await withTenantContext(db, orgBId, (tx) =>
      tx.select({ name: workspaces.name }).from(workspaces),
    );

    expect(rows.map((r) => r.name)).toEqual(["Org B Workspace"]);
  });

  it("fails closed: an unset tenant context sees zero rows, not an error and not everything", async () => {
    // Deliberately not using withTenantContext — app.org_id is never set.
    const rows = await db.select({ name: workspaces.name }).from(workspaces);

    expect(rows).toEqual([]);
  });

  it("fails closed: a made-up org id sees zero rows, not an error", async () => {
    const rows = await withTenantContext(db, uuidv7(), (tx) =>
      tx.select({ name: workspaces.name }).from(workspaces),
    );

    expect(rows).toEqual([]);
  });

  it("WITH CHECK blocks writing a row into the wrong tenant", async () => {
    // A real user row so the only constraint in play is RLS's WITH
    // CHECK, not an incidental FK failure on created_by.
    const [smuggler] = await db
      .insert(users)
      .values({ email: "rls-smuggler@test.dev", name: "Smuggler" })
      .returning({ id: users.id });

    await expect(
      withTenantContext(db, orgAId, (tx) =>
        // org_id says B, but the transaction's tenant context is A —
        // WITH CHECK should reject this even though the app layer
        // "trusted" the orgId value passed in.
        tx.insert(workspaces).values({
          orgId: orgBId,
          name: "Smuggled workspace",
          type: "open",
          position: "a0",
          createdBy: smuggler.id,
        }),
      ),
    ).rejects.toThrow();

    const orgBRows = await withTenantContext(db, orgBId, (tx) =>
      tx.select({ name: workspaces.name }).from(workspaces),
    );
    expect(orgBRows.map((r) => r.name)).toEqual(["Org B Workspace"]);
  });
});
