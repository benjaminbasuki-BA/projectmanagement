import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";
import { signupWithWorkspace } from "../../test/helpers.js";
import { boards } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { withTenantContext } from "../../db/tenant-db.js";
import type { AppDb } from "../../db/types.js";

async function setup(app: FastifyInstance, email: string, slug: string) {
  const { cookie, orgId, workspaceId } = await signupWithWorkspace(
    app,
    email,
    slug,
  );
  const boardRes = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${workspaceId}/boards`,
    headers: { cookie },
    payload: { name: "Acme — Website Redesign", type: "main" },
  });
  const boardId = boardRes.json().board.id as string;

  const groupRes = await app.inject({
    method: "POST",
    url: `/v1/boards/${boardId}/groups`,
    headers: { cookie },
    payload: { title: "Backlog" },
  });
  const groupId = groupRes.json().group.id as string;

  return { cookie, orgId, boardId, groupId };
}

async function createColumn(
  app: FastifyInstance,
  cookie: string,
  boardId: string,
  title: string,
  type: string,
  settings: Record<string, unknown> = {},
) {
  const res = await app.inject({
    method: "POST",
    url: `/v1/boards/${boardId}/columns`,
    headers: { cookie },
    payload: { title, type, settings },
  });
  return res.json().column.id as string;
}

describe("items", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("creates an item with column values across all 8 MVP column types, extracting text/number/date correctly", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "items-full@test.dev",
      "items-full-org",
    );

    const statusCol = await createColumn(
      app,
      cookie,
      boardId,
      "Status",
      "status",
      {
        labels: [
          {
            id: "lbl_wip",
            text: "Working on it",
            color: "#FDAB3D",
            is_done: false,
          },
        ],
      },
    );
    const textCol = await createColumn(app, cookie, boardId, "Brief", "text");
    const longTextCol = await createColumn(
      app,
      cookie,
      boardId,
      "Notes",
      "long_text",
    );
    const numberCol = await createColumn(
      app,
      cookie,
      boardId,
      "Estimate",
      "number",
    );
    const personCol = await createColumn(
      app,
      cookie,
      boardId,
      "Owner",
      "person",
    );
    const dateCol = await createColumn(app, cookie, boardId, "Due", "date");
    const dropdownCol = await createColumn(
      app,
      cookie,
      boardId,
      "Phase",
      "dropdown",
      { options: [{ id: "opt_design", text: "Design" }] },
    );
    const checkboxCol = await createColumn(
      app,
      cookie,
      boardId,
      "Approved",
      "checkbox",
    );

    const create = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: {
        name: "Homepage hero design",
        groupId,
        columnValues: {
          [statusCol]: { label_id: "lbl_wip" },
          [textCol]: { text: "See brief.pdf" },
          [longTextCol]: { text: "Multi-line notes go here." },
          [numberCol]: { number: 12.5 },
          [personCol]: { user_ids: ["019f0000-0000-7000-8000-000000000001"] },
          [dateCol]: { date: "2026-07-18", time: "09:00" },
          [dropdownCol]: { option_ids: ["opt_design"] },
          [checkboxCol]: { checked: true },
        },
      },
    });
    expect(create.statusCode).toBe(201);
    const itemId = create.json().item.id as string;
    expect(create.json().item.displaySeq).toBeGreaterThan(0);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/items/${itemId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    const values = detail.json().columnValues as {
      columnId: string;
      textValue: string | null;
      numberValue: string | null;
      dateValue: string | null;
    }[];
    const byColumn = Object.fromEntries(values.map((v) => [v.columnId, v]));

    expect(byColumn[statusCol].textValue).toBe("Working on it");
    expect(byColumn[textCol].textValue).toBe("See brief.pdf");
    expect(byColumn[numberCol].numberValue).toBe("12.5");
    expect(byColumn[dateCol].dateValue).not.toBeNull();
    expect(byColumn[dropdownCol].textValue).toBe("Design");
    expect(byColumn[checkboxCol].numberValue).toBe("1");
    expect(byColumn[personCol].textValue).toBeNull();
  });

  it("rejects a value shape that doesn't match the column's type", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "items-badvalue@test.dev",
      "items-badvalue-org",
    );
    const numberCol = await createColumn(
      app,
      cookie,
      boardId,
      "Estimate",
      "number",
    );

    const res = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: {
        name: "Bad value item",
        groupId,
        columnValues: { [numberCol]: { number: "not-a-number" } },
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it("rejects an unknown label_id for a status column", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "items-badlabel@test.dev",
      "items-badlabel-org",
    );
    const statusCol = await createColumn(
      app,
      cookie,
      boardId,
      "Status",
      "status",
      {
        labels: [
          {
            id: "lbl_wip",
            text: "Working on it",
            color: "#FDAB3D",
            is_done: false,
          },
        ],
      },
    );

    const res = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: {
        name: "Bad label item",
        groupId,
        columnValues: { [statusCol]: { label_id: "lbl_does_not_exist" } },
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it("rejects creating an item in a group that belongs to a different board", async () => {
    const { cookie, boardId } = await setup(
      app,
      "items-wronggroup@test.dev",
      "items-wronggroup-org",
    );
    const other = await setup(app, "items-other@test.dev", "items-other-org");

    const res = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Cross-board item", groupId: other.groupId },
    });
    expect(res.statusCode).toBe(422);
  });

  it("updates a subset of cells via the column-values hot path without touching the others", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "items-hotpath@test.dev",
      "items-hotpath-org",
    );
    const statusCol = await createColumn(
      app,
      cookie,
      boardId,
      "Status",
      "status",
      {
        labels: [
          {
            id: "lbl_wip",
            text: "Working on it",
            color: "#FDAB3D",
            is_done: false,
          },
          { id: "lbl_done", text: "Done", color: "#00C875", is_done: true },
        ],
      },
    );
    const textCol = await createColumn(app, cookie, boardId, "Brief", "text");

    const create = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: {
        name: "Hot path item",
        groupId,
        columnValues: {
          [statusCol]: { label_id: "lbl_wip" },
          [textCol]: { text: "original" },
        },
      },
    });
    const itemId = create.json().item.id as string;

    const patch = await app.inject({
      method: "PATCH",
      url: `/v1/items/${itemId}/column-values`,
      headers: { cookie },
      payload: { [statusCol]: { label_id: "lbl_done" } },
    });
    expect(patch.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/items/${itemId}`,
      headers: { cookie },
    });
    const values = detail.json().columnValues as {
      columnId: string;
      textValue: string | null;
    }[];
    const byColumn = Object.fromEntries(values.map((v) => [v.columnId, v]));
    expect(byColumn[statusCol].textValue).toBe("Done");
    expect(byColumn[textCol].textValue).toBe("original");
  });

  it("lists items scoped to a board and optionally filtered by group", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "items-list@test.dev",
      "items-list-org",
    );
    const otherGroup = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/groups`,
      headers: { cookie },
      payload: { title: "Done" },
    });
    const otherGroupId = otherGroup.json().group.id as string;

    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "In backlog", groupId },
    });
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "In done", groupId: otherGroupId },
    });

    const all = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
    });
    expect(all.json().items).toHaveLength(2);

    const filtered = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/items?groupId=${groupId}`,
      headers: { cookie },
    });
    expect(filtered.json().items).toHaveLength(1);
    expect(filtered.json().items[0].name).toBe("In backlog");
  });

  it("returns cell values for the whole page with ?include=column_values", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "items-include@test.dev",
      "items-include-org",
    );
    const textCol = await createColumn(app, cookie, boardId, "Brief", "text");

    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: {
        name: "With a cell",
        groupId,
        columnValues: { [textCol]: { text: "hello" } },
      },
    });

    const bare = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
    });
    expect(bare.json().columnValues).toBeUndefined();

    const included = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/items?include=column_values`,
      headers: { cookie },
    });
    expect(included.statusCode).toBe(200);
    const values = included.json().columnValues as {
      columnId: string;
      textValue: string | null;
    }[];
    expect(values).toHaveLength(1);
    expect(values[0].textValue).toBe("hello");
  });

  it("archives and (soft) deletes an item, keeping the board's item_count in sync", async () => {
    const { cookie, orgId, boardId, groupId } = await setup(
      app,
      "items-lifecycle@test.dev",
      "items-lifecycle-org",
    );

    const create = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "To be deleted", groupId },
    });
    const itemId = create.json().item.id as string;

    // Raw db reads/writes outside the API also need withTenantContext —
    // boards is RLS-protected, so an unscoped query here would just see
    // zero rows rather than erroring (db/tenant-db.test.ts covers that
    // "fails closed" behavior directly).
    const boardAfterCreate = await withTenantContext(db, orgId, (tx) =>
      tx
        .select({ itemCount: boards.itemCount })
        .from(boards)
        .where(eq(boards.id, boardId)),
    );
    expect(boardAfterCreate[0].itemCount).toBe(1);

    const archive = await app.inject({
      method: "POST",
      url: `/v1/items/${itemId}/archive`,
      headers: { cookie },
    });
    expect(archive.json().item.archivedAt).not.toBeNull();

    const del = await app.inject({
      method: "DELETE",
      url: `/v1/items/${itemId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);

    const boardAfterDelete = await withTenantContext(db, orgId, (tx) =>
      tx
        .select({ itemCount: boards.itemCount })
        .from(boards)
        .where(eq(boards.id, boardId)),
    );
    expect(boardAfterDelete[0].itemCount).toBe(0);

    const getAfterDelete = await app.inject({
      method: "GET",
      url: `/v1/items/${itemId}`,
      headers: { cookie },
    });
    expect(getAfterDelete.statusCode).toBe(404);
  });

  it("enforces the 20,000-items-per-board hard cap", async () => {
    const { cookie, orgId, boardId, groupId } = await setup(
      app,
      "items-limit@test.dev",
      "items-limit-org",
    );

    // Simulates the board already being at the cap rather than actually
    // creating 20,000 items (impractically slow for a test) — this
    // exercises the same check the route runs (`board.itemCount >=
    // MAX_ITEMS_PER_BOARD`) without the runtime cost.
    await withTenantContext(db, orgId, (tx) =>
      tx
        .update(boards)
        .set({ itemCount: 20_000 })
        .where(eq(boards.id, boardId)),
    );

    const res = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "One too many", groupId },
    });
    expect(res.statusCode).toBe(422);
  });

  it("never shows one org's items to another org (cross-tenant isolation)", async () => {
    const a = await setup(app, "items-a@crosstenant.test", "items-org-a");
    const create = await app.inject({
      method: "POST",
      url: `/v1/boards/${a.boardId}/items`,
      headers: { cookie: a.cookie },
      payload: { name: "Org A item", groupId: a.groupId },
    });
    const itemId = create.json().item.id as string;

    const b = await setup(app, "items-b@crosstenant.test", "items-org-b");

    const crossRead = await app.inject({
      method: "GET",
      url: `/v1/items/${itemId}`,
      headers: { cookie: b.cookie },
    });
    expect(crossRead.statusCode).toBe(404);
  });
});
