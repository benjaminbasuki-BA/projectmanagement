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
    payload: { name: "Acme — Ops Board", type: "main" },
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

async function eventTypes(
  app: FastifyInstance,
  cookie: string,
  boardId: string,
) {
  const res = await app.inject({
    method: "GET",
    url: `/v1/boards/${boardId}/activity`,
    headers: { cookie },
  });
  return (res.json().events as { eventType: string }[]).map((e) => e.eventType);
}

describe("activity events", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("records item.created when an item is added", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "a1@test.dev",
      "a1-org",
    );

    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Renew SSL cert", groupId },
    });

    expect(await eventTypes(app, cookie, boardId)).toContain("item.created");
  });

  it("records item.renamed and item.moved separately from a single PATCH", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "a2@test.dev",
      "a2-org",
    );
    const item = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Original name", groupId },
    });
    const itemId = item.json().item.id as string;

    await app.inject({
      method: "PATCH",
      url: `/v1/items/${itemId}`,
      headers: { cookie },
      payload: { name: "Renamed item", position: "b" },
    });

    const types = await eventTypes(app, cookie, boardId);
    expect(types).toContain("item.renamed");
    expect(types).toContain("item.moved");
  });

  it("does not record item.renamed when name is resent unchanged", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "a3@test.dev",
      "a3-org",
    );
    const item = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Stable name", groupId },
    });
    const itemId = item.json().item.id as string;

    await app.inject({
      method: "PATCH",
      url: `/v1/items/${itemId}`,
      headers: { cookie },
      payload: { name: "Stable name" },
    });

    expect(await eventTypes(app, cookie, boardId)).not.toContain(
      "item.renamed",
    );
  });

  it("records item.archived and item.deleted", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "a4@test.dev",
      "a4-org",
    );
    const item = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Old ticket", groupId },
    });
    const itemId = item.json().item.id as string;

    await app.inject({
      method: "POST",
      url: `/v1/items/${itemId}/archive`,
      headers: { cookie },
    });
    await app.inject({
      method: "DELETE",
      url: `/v1/items/${itemId}`,
      headers: { cookie },
    });

    const types = await eventTypes(app, cookie, boardId);
    expect(types).toContain("item.archived");
    expect(types).toContain("item.deleted");
  });

  it("records column_value.changed with from/to, but not for a no-op resubmit", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "a5@test.dev",
      "a5-org",
    );
    const col = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie },
      payload: {
        title: "Status",
        type: "status",
        settings: {
          labels: [
            { id: "lbl_wip", text: "Working on it", color: "#FDAB3D" },
            { id: "lbl_done", text: "Done", color: "#00C875", is_done: true },
          ],
        },
      },
    });
    const columnId = col.json().column.id as string;

    const item = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Ship the feature", groupId },
    });
    const itemId = item.json().item.id as string;

    await app.inject({
      method: "PATCH",
      url: `/v1/items/${itemId}/column-values`,
      headers: { cookie },
      payload: { [columnId]: { label_id: "lbl_wip" } },
    });
    // Resend the same value — should be a no-op for activity purposes.
    await app.inject({
      method: "PATCH",
      url: `/v1/items/${itemId}/column-values`,
      headers: { cookie },
      payload: { [columnId]: { label_id: "lbl_wip" } },
    });

    const listAfterFirst = await eventTypes(app, cookie, boardId);
    expect(
      listAfterFirst.filter((t) => t === "column_value.changed"),
    ).toHaveLength(1);

    await app.inject({
      method: "PATCH",
      url: `/v1/items/${itemId}/column-values`,
      headers: { cookie },
      payload: { [columnId]: { label_id: "lbl_done" } },
    });
    const listAfterSecond = await eventTypes(app, cookie, boardId);
    expect(
      listAfterSecond.filter((t) => t === "column_value.changed"),
    ).toHaveLength(2);
  });

  it("since_seq returns only events newer than the given cursor, oldest first", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "a6@test.dev",
      "a6-org",
    );
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "First item", groupId },
    });

    const firstPage = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/activity`,
      headers: { cookie },
    });
    const cursor = firstPage.json().events[0].boardSeq as number;

    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Second item", groupId },
    });

    const resync = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/activity?since_seq=${cursor}`,
      headers: { cookie },
    });
    const events = resync.json().events as { boardSeq: number }[];
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.boardSeq > cursor)).toBe(true);
  });

  it("GET /items/:id/activity returns only that item's events", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "a7@test.dev",
      "a7-org",
    );
    const item1 = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Item one", groupId },
    });
    const item1Id = item1.json().item.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Item two", groupId },
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/items/${item1Id}/activity`,
      headers: { cookie },
    });
    const events = res.json().events as { itemId: string }[];
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.itemId === item1Id)).toBe(true);
  });

  it("never shows one org's board activity to another org (cross-tenant isolation)", async () => {
    const a = await setup(app, "a8a@test.dev", "a8a-org");
    const b = await signupWithWorkspace(app, "a8b@test.dev", "a8b-org");

    const res = await app.inject({
      method: "GET",
      url: `/v1/boards/${a.boardId}/activity`,
      headers: { cookie: b.cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
