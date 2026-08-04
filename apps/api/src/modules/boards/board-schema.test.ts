import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";
import { signupWithWorkspace } from "../../test/helpers.js";

async function createBoard(
  app: FastifyInstance,
  cookie: string,
  workspaceId: string,
) {
  const res = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${workspaceId}/boards`,
    headers: { cookie },
    payload: { name: "Test Board", type: "main" },
  });
  return res.json().board.id as string;
}

describe("board_groups", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildServer(await createTestDb());
  });

  it("creates, lists, updates, and (soft) deletes groups", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "groups@test.dev",
      "groups-org",
    );
    const boardId = await createBoard(app, cookie, workspaceId);

    const create = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/groups`,
      headers: { cookie },
      payload: { title: "Backlog", color: "gray" },
    });
    expect(create.statusCode).toBe(201);
    const groupId = create.json().group.id as string;

    const list = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/groups`,
      headers: { cookie },
    });
    expect(list.json().groups).toHaveLength(1);

    const update = await app.inject({
      method: "PATCH",
      url: `/v1/groups/${groupId}`,
      headers: { cookie },
      payload: { title: "This Week", color: "orange" },
    });
    expect(update.json().group.title).toBe("This Week");

    const del = await app.inject({
      method: "DELETE",
      url: `/v1/groups/${groupId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);

    const listAfter = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/groups`,
      headers: { cookie },
    });
    expect(listAfter.json().groups).toHaveLength(0);
  });
});

describe("columns", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildServer(await createTestDb());
  });

  it("creates a column of each MVP type and rejects a non-MVP type", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "columns@test.dev",
      "columns-org",
    );
    const boardId = await createBoard(app, cookie, workspaceId);

    for (const type of [
      "status",
      "text",
      "long_text",
      "number",
      "person",
      "date",
      "dropdown",
      "checkbox",
    ]) {
      const res = await app.inject({
        method: "POST",
        url: `/v1/boards/${boardId}/columns`,
        headers: { cookie },
        payload: { title: type, type },
      });
      expect(res.statusCode, `column type ${type}`).toBe(201);
    }

    const rejected = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie },
      payload: { title: "Timeline", type: "timeline" },
    });
    expect(rejected.statusCode).toBe(422);
  });

  it("enforces the 50-column-per-board limit", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "column-limit@test.dev",
      "column-limit-org",
    );
    const boardId = await createBoard(app, cookie, workspaceId);

    for (let i = 0; i < 50; i++) {
      const res = await app.inject({
        method: "POST",
        url: `/v1/boards/${boardId}/columns`,
        headers: { cookie },
        payload: { title: `Column ${i}`, type: "text" },
      });
      expect(res.statusCode, `column #${i}`).toBe(201);
    }

    const overLimit = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie },
      payload: { title: "One too many", type: "text" },
    });
    expect(overLimit.statusCode).toBe(422);
  }, 20000);

  it("updates and (soft) deletes a column, ignoring an attempted type change", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "column-update@test.dev",
      "column-update-org",
    );
    const boardId = await createBoard(app, cookie, workspaceId);

    const create = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie },
      payload: { title: "Status", type: "status" },
    });
    const columnId = create.json().column.id as string;

    // `type` isn't in updateColumnSchema at all, so it's silently
    // ignored rather than applied — doc04 §2.4: "Type change rejected".
    const update = await app.inject({
      method: "PATCH",
      url: `/v1/columns/${columnId}`,
      headers: { cookie },
      payload: { title: "Stage", type: "number" },
    });
    expect(update.json().column.title).toBe("Stage");
    expect(update.json().column.type).toBe("status");

    const del = await app.inject({
      method: "DELETE",
      url: `/v1/columns/${columnId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
  });
});

describe("views", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildServer(await createTestDb());
  });

  it("creates table/kanban views and rejects a non-MVP view type", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "views@test.dev",
      "views-org",
    );
    const boardId = await createBoard(app, cookie, workspaceId);

    const table = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/views`,
      headers: { cookie },
      payload: { type: "table", name: "Table", isShared: true },
    });
    expect(table.statusCode).toBe(201);

    const kanban = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/views`,
      headers: { cookie },
      payload: { type: "kanban", name: "Kanban", isShared: true },
    });
    expect(kanban.statusCode).toBe(201);

    const rejected = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/views`,
      headers: { cookie },
      payload: { type: "calendar", name: "Calendar" },
    });
    expect(rejected.statusCode).toBe(422);

    const list = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/views`,
      headers: { cookie },
    });
    expect(list.json().views).toHaveLength(2);
  });

  it("deletes a view", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "views-delete@test.dev",
      "views-delete-org",
    );
    const boardId = await createBoard(app, cookie, workspaceId);

    const create = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/views`,
      headers: { cookie },
      payload: { type: "table", name: "Table", isShared: true },
    });
    const viewId = create.json().view.id as string;

    const del = await app.inject({
      method: "DELETE",
      url: `/v1/views/${viewId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
  });
});
