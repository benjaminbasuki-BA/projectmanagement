import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";
import { signupWithWorkspace, addSecondOrgMember } from "../../test/helpers.js";
import type { AppDb } from "../../db/types.js";

async function setup(
  app: FastifyInstance,
  db: AppDb,
  emailA: string,
  slug: string,
) {
  const a = await signupWithWorkspace(app, emailA, slug);
  const b = await addSecondOrgMember(app, db, a.orgId, `${slug}-b@test.dev`);

  const boardRes = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${a.workspaceId}/boards`,
    headers: { cookie: a.cookie },
    payload: { name: "Client Site Launch", type: "main" },
  });
  const boardId = boardRes.json().board.id as string;

  const groupRes = await app.inject({
    method: "POST",
    url: `/v1/boards/${boardId}/groups`,
    headers: { cookie: a.cookie },
    payload: { title: "Backlog" },
  });
  const groupId = groupRes.json().group.id as string;

  return { a, b, orgId: a.orgId, boardId, groupId };
}

async function unread(app: FastifyInstance, cookie: string) {
  const res = await app.inject({
    method: "GET",
    url: "/v1/notifications?unread=true",
    headers: { cookie },
  });
  return res.json().notifications as { id: string; eventType: string }[];
}

describe("notifications", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("notifies the item creator when someone else replies, but not themselves", async () => {
    const { a, b, boardId, groupId } = await setup(
      app,
      db,
      "n1a@test.dev",
      "n1-org",
    );
    const item = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie: a.cookie },
      payload: { name: "Homepage copy", groupId },
    });
    const itemId = item.json().item.id as string;

    // A comments on their own item — no self-notification.
    await app.inject({
      method: "POST",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie: a.cookie },
      payload: { bodyText: "Starting this up" },
    });
    expect(await unread(app, a.cookie)).toHaveLength(0);

    // B replies — A should be notified, B should not.
    await app.inject({
      method: "POST",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie: b.cookie },
      payload: { bodyText: "On it" },
    });
    const aUnread = await unread(app, a.cookie);
    expect(aUnread.some((n) => n.eventType === "reply")).toBe(true);
    expect(await unread(app, b.cookie)).toHaveLength(0);
  });

  it("notifies a comment's author on reaction, once — not again on a repeat toggle", async () => {
    const { a, b, boardId, groupId } = await setup(
      app,
      db,
      "n2a@test.dev",
      "n2-org",
    );
    const item = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie: a.cookie },
      payload: { name: "Logo revisions", groupId },
    });
    const itemId = item.json().item.id as string;
    const comment = await app.inject({
      method: "POST",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie: a.cookie },
      payload: { bodyText: "First pass attached" },
    });
    const commentId = comment.json().comment.id as string;

    await app.inject({
      method: "PUT",
      url: `/v1/comments/${commentId}/reactions/%F0%9F%91%8D`,
      headers: { cookie: b.cookie },
    });
    let aUnread = await unread(app, a.cookie);
    expect(aUnread.filter((n) => n.eventType === "reaction")).toHaveLength(1);

    // Re-PUTting the same reaction is a no-op (idempotent) — no second notification.
    await app.inject({
      method: "PUT",
      url: `/v1/comments/${commentId}/reactions/%F0%9F%91%8D`,
      headers: { cookie: b.cookie },
    });
    aUnread = await unread(app, a.cookie);
    expect(aUnread.filter((n) => n.eventType === "reaction")).toHaveLength(1);
  });

  it("notifies (and subscribes) someone newly added to a person column", async () => {
    const { a, b, boardId, groupId } = await setup(
      app,
      db,
      "n3a@test.dev",
      "n3-org",
    );
    const col = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie: a.cookie },
      payload: { title: "Owner", type: "person" },
    });
    const columnId = col.json().column.id as string;

    const item = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie: a.cookie },
      payload: { name: "Set up staging env", groupId },
    });
    const itemId = item.json().item.id as string;

    await app.inject({
      method: "PATCH",
      url: `/v1/items/${itemId}/column-values`,
      headers: { cookie: a.cookie },
      payload: { [columnId]: { user_ids: [b.userId] } },
    });

    const bUnread = await unread(app, b.cookie);
    expect(bUnread.some((n) => n.eventType === "assigned")).toBe(true);

    // Being assigned subscribed B, so a later status change reaches them too.
    const statusCol = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie: a.cookie },
      payload: {
        title: "Status",
        type: "status",
        settings: {
          labels: [
            { id: "lbl_done", text: "Done", color: "#00C875", is_done: true },
          ],
        },
      },
    });
    const statusColumnId = statusCol.json().column.id as string;
    await app.inject({
      method: "PATCH",
      url: `/v1/items/${itemId}/column-values`,
      headers: { cookie: a.cookie },
      payload: { [statusColumnId]: { label_id: "lbl_done" } },
    });
    const bUnreadAfterStatus = await unread(app, b.cookie);
    expect(
      bUnreadAfterStatus.some((n) => n.eventType === "status_changed"),
    ).toBe(true);
  });

  it("marks individual and all notifications read", async () => {
    const { a, b, boardId, groupId } = await setup(
      app,
      db,
      "n4a@test.dev",
      "n4-org",
    );
    const item = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie: a.cookie },
      payload: { name: "Item one", groupId },
    });
    const itemId = item.json().item.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie: b.cookie },
      payload: { bodyText: "Reply one" },
    });
    await app.inject({
      method: "POST",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie: b.cookie },
      payload: { bodyText: "Reply two" },
    });

    const before = await unread(app, a.cookie);
    expect(before.length).toBeGreaterThanOrEqual(2);

    const markOne = await app.inject({
      method: "POST",
      url: "/v1/notifications/mark-read",
      headers: { cookie: a.cookie },
      payload: { ids: [before[0]!.id] },
    });
    expect(markOne.statusCode).toBe(204);
    expect(await unread(app, a.cookie)).toHaveLength(before.length - 1);

    const markAll = await app.inject({
      method: "POST",
      url: "/v1/notifications/mark-all-read",
      headers: { cookie: a.cookie },
    });
    expect(markAll.statusCode).toBe(204);
    expect(await unread(app, a.cookie)).toHaveLength(0);

    const countRes = await app.inject({
      method: "GET",
      url: "/v1/notifications/unread-count",
      headers: { cookie: a.cookie },
    });
    expect(countRes.json().count).toBe(0);
  });

  it("muting a board suppresses notifications from it", async () => {
    const { a, b, boardId, groupId } = await setup(
      app,
      db,
      "n5a@test.dev",
      "n5-org",
    );

    const mute = await app.inject({
      method: "PUT",
      url: `/v1/boards/${boardId}/mute`,
      headers: { cookie: a.cookie },
    });
    expect(mute.statusCode).toBe(204);

    const item = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie: a.cookie },
      payload: { name: "Muted board item", groupId },
    });
    const itemId = item.json().item.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie: b.cookie },
      payload: { bodyText: "Should not notify A" },
    });
    expect(await unread(app, a.cookie)).toHaveLength(0);

    const unmute = await app.inject({
      method: "DELETE",
      url: `/v1/boards/${boardId}/mute`,
      headers: { cookie: a.cookie },
    });
    expect(unmute.statusCode).toBe(204);

    await app.inject({
      method: "POST",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie: b.cookie },
      payload: { bodyText: "Should notify A now" },
    });
    expect(await unread(app, a.cookie)).toHaveLength(1);
  });

  it("never shows one org's notifications to another org (cross-tenant isolation)", async () => {
    const { a } = await setup(app, db, "n6a@test.dev", "n6-org");
    const other = await signupWithWorkspace(app, "n6c@test.dev", "n6c-org");

    const res = await app.inject({
      method: "GET",
      url: "/v1/notifications",
      headers: { cookie: other.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().notifications).toHaveLength(0);
    void a;
  });
});
