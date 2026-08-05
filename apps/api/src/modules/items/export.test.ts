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
    payload: { name: "Export Test Board", type: "main" },
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

describe("CSV export", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("exports items with header row and resolved status text", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "e1@test.dev",
      "e1-org",
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
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: {
        name: "Ship the feature",
        groupId,
        columnValues: { [columnId]: { label_id: "lbl_done" } },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/export.csv`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    const lines = res.body.trim().split("\r\n");
    expect(lines[0]).toBe("Item,Status");
    expect(lines[1]).toBe("Ship the feature,Done");
  });

  it("quotes fields containing commas", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "e2@test.dev",
      "e2-org",
    );
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Redesign, homepage & footer", groupId },
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/export.csv`,
      headers: { cookie },
    });
    expect(res.body).toContain('"Redesign, homepage & footer"');
  });

  it("resolves person columns to names, not ids", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "e3@test.dev",
      "e3-org",
    );
    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie },
    });
    const userId = me.json().user.id as string;
    const userName = me.json().user.name as string;

    const col = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie },
      payload: { title: "Owner", type: "person" },
    });
    const columnId = col.json().column.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: {
        name: "Kickoff",
        groupId,
        columnValues: { [columnId]: { user_ids: [userId] } },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/export.csv`,
      headers: { cookie },
    });
    expect(res.body).toContain(userName);
    expect(res.body).not.toContain(userId);
  });

  it("respects ?filter= — only exports matching rows", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "e4@test.dev",
      "e4-org",
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
            { id: "lbl_done", text: "Done", color: "#00C875" },
          ],
        },
      },
    });
    const columnId = col.json().column.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: {
        name: "Done item",
        groupId,
        columnValues: { [columnId]: { label_id: "lbl_done" } },
      },
    });
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: {
        name: "WIP item",
        groupId,
        columnValues: { [columnId]: { label_id: "lbl_wip" } },
      },
    });

    const filter = {
      op: "and",
      rules: [{ column_id: columnId, cmp: "is_any_of", value: ["lbl_done"] }],
    };
    const res = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/export.csv?filter=${encodeURIComponent(JSON.stringify(filter))}`,
      headers: { cookie },
    });
    const lines = res.body.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Done item");
  });

  it("never exports another org's board (cross-tenant isolation)", async () => {
    const a = await setup(app, "e5a@test.dev", "e5-org");
    const b = await signupWithWorkspace(app, "e5b@test.dev", "e5b-org");
    const res = await app.inject({
      method: "GET",
      url: `/v1/boards/${a.boardId}/export.csv`,
      headers: { cookie: b.cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
