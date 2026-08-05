import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";
import { signupWithWorkspace } from "../../test/helpers.js";
import { BOARD_TEMPLATES } from "./templates.js";
import type { AppDb } from "../../db/types.js";

describe("templates", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("lists all 6 MVP starter templates", async () => {
    const { cookie } = await signupWithWorkspace(app, "t1@test.dev", "t1-org");
    const res = await app.inject({
      method: "GET",
      url: "/v1/templates",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const templates = res.json().templates as { id: string }[];
    expect(templates.map((t) => t.id).sort()).toEqual(
      [
        "bug-issue-tracker",
        "client-onboarding",
        "client-project-delivery",
        "content-calendar",
        "creative-request-intake",
        "simple-sprint",
      ].sort(),
    );
  });

  it("filters templates by category", async () => {
    const { cookie } = await signupWithWorkspace(app, "t2@test.dev", "t2-org");
    const res = await app.inject({
      method: "GET",
      url: "/v1/templates?category=Product",
      headers: { cookie },
    });
    const templates = res.json().templates as {
      id: string;
      category: string;
    }[];
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((t) => t.category === "Product")).toBe(true);
  });

  it("rejects creating a board with an unknown template id", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "t3@test.dev",
      "t3-org",
    );
    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/boards`,
      headers: { cookie },
      payload: { name: "Bogus", templateId: "does-not-exist" },
    });
    expect(res.statusCode).toBe(422);
  });

  for (const template of BOARD_TEMPLATES) {
    it(`instantiates "${template.name}" with the right groups/columns/items`, async () => {
      const { cookie, workspaceId } = await signupWithWorkspace(
        app,
        `t-${template.id}@test.dev`,
        `t-${template.id}-org`,
      );

      const boardRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/boards`,
        headers: { cookie },
        payload: { name: template.name, templateId: template.id },
      });
      expect(boardRes.statusCode).toBe(201);
      const boardId = boardRes.json().board.id as string;
      expect(boardRes.json().board.itemCount).toBe(template.items.length);

      const groupsRes = await app.inject({
        method: "GET",
        url: `/v1/boards/${boardId}/groups`,
        headers: { cookie },
      });
      expect(groupsRes.json().groups).toHaveLength(template.groups.length);

      const columnsRes = await app.inject({
        method: "GET",
        url: `/v1/boards/${boardId}/columns`,
        headers: { cookie },
      });
      expect(columnsRes.json().columns).toHaveLength(template.columns.length);

      const itemsRes = await app.inject({
        method: "GET",
        url: `/v1/boards/${boardId}/items?include=column_values`,
        headers: { cookie },
      });
      expect(itemsRes.json().items).toHaveLength(template.items.length);
      // Every templated item that set a status value should have a
      // resolved text_value, not just the raw label_id — proves
      // extractTemplateValue actually looked the label up, not just
      // echoed the id through.
      const statusColumnId = columnsRes.json().columns[0].id as string;
      const columnValues = itemsRes.json().columnValues as {
        columnId: string;
        textValue: string | null;
      }[];
      const statusValues = columnValues.filter(
        (cv) => cv.columnId === statusColumnId,
      );
      expect(statusValues.length).toBeGreaterThan(0);
      expect(statusValues.every((cv) => !!cv.textValue)).toBe(true);
    });
  }

  it("assigns assignToCreator items to whoever instantiated the template", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "t4@test.dev",
      "t4-org",
    );
    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie },
    });
    const userId = me.json().user.id as string;

    const boardRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/boards`,
      headers: { cookie },
      payload: { name: "Simple Sprint", templateId: "simple-sprint" },
    });
    const boardId = boardRes.json().board.id as string;

    const columnsRes = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie },
    });
    const assigneeColumnId = columnsRes
      .json()
      .columns.find((c: { title: string }) => c.title === "Assignee").id;

    const itemsRes = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/items?include=column_values`,
      headers: { cookie },
    });
    const assigneeValues = (
      itemsRes.json().columnValues as {
        columnId: string;
        value: { user_ids?: string[] };
      }[]
    ).filter((cv) => cv.columnId === assigneeColumnId);
    expect(assigneeValues.length).toBeGreaterThan(0);
    expect(
      assigneeValues.every((cv) => cv.value.user_ids?.includes(userId)),
    ).toBe(true);
  });

  it("filtering works on a templated board (proves items are real, queryable rows)", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "t5@test.dev",
      "t5-org",
    );
    const boardRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/boards`,
      headers: { cookie },
      payload: { name: "Bug Tracker", templateId: "bug-issue-tracker" },
    });
    const boardId = boardRes.json().board.id as string;
    const columnsRes = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/columns`,
      headers: { cookie },
    });
    const statusColumnId = columnsRes.json().columns[0].id as string;

    const filter = {
      op: "and",
      rules: [
        { column_id: statusColumnId, cmp: "is_any_of", value: ["lbl_done"] },
      ],
    };
    const res = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/items?filter=${encodeURIComponent(JSON.stringify(filter))}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json().items as unknown[]).length).toBeGreaterThan(0);
  });
});
