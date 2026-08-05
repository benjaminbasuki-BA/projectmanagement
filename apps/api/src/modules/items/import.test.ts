import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";
import { signupWithWorkspace } from "../../test/helpers.js";
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
    payload: { name: "Import Test Board", type: "main" },
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

describe("CSV import", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("imports rows with column values in one call", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "i1@test.dev",
      "i1-org",
    );
    const col = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie },
      payload: {
        title: "Status",
        type: "status",
        settings: {
          labels: [{ id: "lbl_done", text: "Done", color: "#00C875" }],
        },
      },
    });
    const columnId = col.json().column.id as string;

    const res = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/import`,
      headers: { cookie },
      payload: {
        groupId,
        items: [
          {
            name: "Row one",
            columnValues: { [columnId]: { label_id: "lbl_done" } },
          },
          { name: "Row two" },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().count).toBe(2);

    const items = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/items?include=column_values`,
      headers: { cookie },
    });
    expect(items.json().items).toHaveLength(2);
    const row1Value = (
      items.json().columnValues as { textValue: string }[]
    ).find((cv) => cv.textValue === "Done");
    expect(row1Value).toBeTruthy();

    const board = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}`,
      headers: { cookie },
    });
    expect(board.json().board.itemCount).toBe(2);
  });

  it("is all-or-nothing — one bad row rejects the whole import", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "i2@test.dev",
      "i2-org",
    );
    const col = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie },
      payload: { title: "Qty", type: "number" },
    });
    const columnId = col.json().column.id as string;

    const res = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/import`,
      headers: { cookie },
      payload: {
        groupId,
        items: [
          { name: "Good row", columnValues: { [columnId]: { number: 5 } } },
          // number column given a status-shaped value — invalid.
          {
            name: "Bad row",
            columnValues: { [columnId]: { label_id: "nope" } },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(422);

    const items = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
    });
    expect(items.json().items).toHaveLength(0);
  });

  it("rejects an import into a group that doesn't belong to the board", async () => {
    const a = await setup(app, "i3a@test.dev", "i3-org");
    const b = await setup(app, "i3b@test.dev", "i3b-org");
    const res = await app.inject({
      method: "POST",
      url: `/v1/boards/${a.boardId}/import`,
      headers: { cookie: a.cookie },
      payload: { groupId: b.groupId, items: [{ name: "Should fail" }] },
    });
    expect(res.statusCode).toBe(422);
  });

  it("records one aggregate items.imported activity event, not one per row", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "i4@test.dev",
      "i4-org",
    );
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/import`,
      headers: { cookie },
      payload: {
        groupId,
        items: [{ name: "A" }, { name: "B" }, { name: "C" }],
      },
    });

    const activity = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/activity`,
      headers: { cookie },
    });
    const events = activity.json().events as {
      eventType: string;
      payload: { count?: number };
    }[];
    const imported = events.filter((e) => e.eventType === "items.imported");
    expect(imported).toHaveLength(1);
    expect(imported[0]!.payload.count).toBe(3);
    expect(events.filter((e) => e.eventType === "item.created")).toHaveLength(
      0,
    );
  });

  it("never imports into another org's board (cross-tenant isolation)", async () => {
    const a = await setup(app, "i5a@test.dev", "i5-org");
    const b = await signupWithWorkspace(app, "i5b@test.dev", "i5b-org");
    const res = await app.inject({
      method: "POST",
      url: `/v1/boards/${a.boardId}/import`,
      headers: { cookie: b.cookie },
      payload: { groupId: a.groupId, items: [{ name: "Should not land" }] },
    });
    expect(res.statusCode).toBe(404);
  });
});
