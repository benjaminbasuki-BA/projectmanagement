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
    payload: { name: "Filter Test Board", type: "main" },
  });
  const boardId = boardRes.json().board.id as string;

  const groupRes = await app.inject({
    method: "POST",
    url: `/v1/boards/${boardId}/groups`,
    headers: { cookie },
    payload: { title: "Backlog" },
  });
  const groupId = groupRes.json().group.id as string;

  const userId = (
    await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } })
  ).json().user.id as string;

  return { cookie, orgId, boardId, groupId, userId };
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

async function createItem(
  app: FastifyInstance,
  cookie: string,
  boardId: string,
  groupId: string,
  name: string,
  columnValues?: Record<string, unknown>,
) {
  const res = await app.inject({
    method: "POST",
    url: `/v1/boards/${boardId}/items`,
    headers: { cookie },
    payload: { name, groupId, columnValues },
  });
  return res.json().item.id as string;
}

async function filteredNames(
  app: FastifyInstance,
  cookie: string,
  boardId: string,
  filter: object,
) {
  const res = await app.inject({
    method: "GET",
    url: `/v1/boards/${boardId}/items?filter=${encodeURIComponent(JSON.stringify(filter))}`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
  return (res.json().items as { name: string }[]).map((i) => i.name).sort();
}

describe("item filters", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("filters status by is_any_of / is_none_of", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "f1@test.dev",
      "f1-org",
    );
    const statusCol = await createColumn(
      app,
      cookie,
      boardId,
      "Status",
      "status",
      {
        labels: [
          { id: "lbl_wip", text: "Working on it", color: "#FDAB3D" },
          { id: "lbl_done", text: "Done", color: "#00C875", is_done: true },
        ],
      },
    );
    await createItem(app, cookie, boardId, groupId, "Working item", {
      [statusCol]: { label_id: "lbl_wip" },
    });
    await createItem(app, cookie, boardId, groupId, "Done item", {
      [statusCol]: { label_id: "lbl_done" },
    });
    await createItem(app, cookie, boardId, groupId, "No status item");

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "and",
        rules: [
          { column_id: statusCol, cmp: "is_any_of", value: ["lbl_done"] },
        ],
      }),
    ).toEqual(["Done item"]);

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "and",
        rules: [
          { column_id: statusCol, cmp: "is_none_of", value: ["lbl_done"] },
        ],
      }),
    ).toEqual(["No status item", "Working item"]);
  });

  it("filters person by is_me, is_any_of, and is_empty", async () => {
    const { cookie, boardId, groupId, userId } = await setup(
      app,
      "f2@test.dev",
      "f2-org",
    );
    const ownerCol = await createColumn(
      app,
      cookie,
      boardId,
      "Owner",
      "person",
    );
    await createItem(app, cookie, boardId, groupId, "Mine", {
      [ownerCol]: { user_ids: [userId] },
    });
    await createItem(app, cookie, boardId, groupId, "Someone else's", {
      [ownerCol]: { user_ids: ["019fca69-cba2-7135-bf8e-39e4e53b17d9"] },
    });
    await createItem(app, cookie, boardId, groupId, "Unassigned");

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "and",
        rules: [{ column_id: ownerCol, cmp: "is_me" }],
      }),
    ).toEqual(["Mine"]);

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "and",
        rules: [{ column_id: ownerCol, cmp: "is_empty" }],
      }),
    ).toEqual(["Unassigned"]);
  });

  it("filters dates: overdue, before, after, is", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "f3@test.dev",
      "f3-org",
    );
    const dueCol = await createColumn(app, cookie, boardId, "Due", "date");
    await createItem(app, cookie, boardId, groupId, "Overdue item", {
      [dueCol]: { date: "2020-01-01", time: null },
    });
    await createItem(app, cookie, boardId, groupId, "Future item", {
      [dueCol]: { date: "2099-01-01", time: null },
    });

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "and",
        rules: [{ column_id: dueCol, cmp: "overdue" }],
      }),
    ).toEqual(["Overdue item"]);

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "and",
        rules: [{ column_id: dueCol, cmp: "after", value: "2050-01-01" }],
      }),
    ).toEqual(["Future item"]);

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "and",
        rules: [{ column_id: dueCol, cmp: "is", value: "2020-01-01" }],
      }),
    ).toEqual(["Overdue item"]);
  });

  it("filters numbers: eq, gt, between", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "f4@test.dev",
      "f4-org",
    );
    const qtyCol = await createColumn(app, cookie, boardId, "Qty", "number");
    await createItem(app, cookie, boardId, groupId, "Five", {
      [qtyCol]: { number: 5 },
    });
    await createItem(app, cookie, boardId, groupId, "Twenty", {
      [qtyCol]: { number: 20 },
    });

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "and",
        rules: [{ column_id: qtyCol, cmp: "gt", value: 10 }],
      }),
    ).toEqual(["Twenty"]);

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "and",
        rules: [{ column_id: qtyCol, cmp: "between", value: [1, 6] }],
      }),
    ).toEqual(["Five"]);
  });

  it("filters text with contains, case-insensitively", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "f5@test.dev",
      "f5-org",
    );
    const briefCol = await createColumn(app, cookie, boardId, "Brief", "text");
    await createItem(app, cookie, boardId, groupId, "Item A", {
      [briefCol]: { text: "Redesign the HOMEPAGE hero" },
    });
    await createItem(app, cookie, boardId, groupId, "Item B", {
      [briefCol]: { text: "Fix the footer" },
    });

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "and",
        rules: [{ column_id: briefCol, cmp: "contains", value: "homepage" }],
      }),
    ).toEqual(["Item A"]);
  });

  it("combines rules with OR", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "f6@test.dev",
      "f6-org",
    );
    const statusCol = await createColumn(
      app,
      cookie,
      boardId,
      "Status",
      "status",
      {
        labels: [
          { id: "lbl_done", text: "Done", color: "#00C875", is_done: true },
        ],
      },
    );
    const qtyCol = await createColumn(app, cookie, boardId, "Qty", "number");
    await createItem(app, cookie, boardId, groupId, "Done but small", {
      [statusCol]: { label_id: "lbl_done" },
      [qtyCol]: { number: 1 },
    });
    await createItem(app, cookie, boardId, groupId, "Not done but huge", {
      [qtyCol]: { number: 100 },
    });
    await createItem(app, cookie, boardId, groupId, "Neither", {
      [qtyCol]: { number: 1 },
    });

    expect(
      await filteredNames(app, cookie, boardId, {
        op: "or",
        rules: [
          { column_id: statusCol, cmp: "is_any_of", value: ["lbl_done"] },
          { column_id: qtyCol, cmp: "gt", value: 50 },
        ],
      }),
    ).toEqual(["Done but small", "Not done but huge"]);
  });

  it("rejects an unknown column id and a comparator invalid for the column's type", async () => {
    const { cookie, boardId } = await setup(app, "f7@test.dev", "f7-org");
    const textCol = await createColumn(app, cookie, boardId, "Brief", "text");

    const badColumn = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/items?filter=${encodeURIComponent(
        JSON.stringify({
          op: "and",
          rules: [
            { column_id: "019fca69-cba2-7135-bf8e-39e4e53b17d9", cmp: "is" },
          ],
        }),
      )}`,
      headers: { cookie },
    });
    expect(badColumn.statusCode).toBe(422);

    const badComparator = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/items?filter=${encodeURIComponent(
        JSON.stringify({
          op: "and",
          rules: [{ column_id: textCol, cmp: "overdue" }],
        }),
      )}`,
      headers: { cookie },
    });
    expect(badComparator.statusCode).toBe(422);
  });
});
