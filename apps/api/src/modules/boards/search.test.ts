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
    payload: { name: "Search Test Board", type: "main" },
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

async function search(
  app: FastifyInstance,
  cookie: string,
  boardId: string,
  q: string,
) {
  return app.inject({
    method: "GET",
    url: `/v1/boards/${boardId}/search?q=${encodeURIComponent(q)}`,
    headers: { cookie },
  });
}

describe("board search", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("finds items by name, case-insensitively", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "s1@test.dev",
      "s1-org",
    );
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Redesign the Homepage hero", groupId },
    });
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Fix the footer", groupId },
    });

    const res = await search(app, cookie, boardId, "homepage");
    expect(res.statusCode).toBe(200);
    const names = (res.json().items as { name: string }[]).map((i) => i.name);
    expect(names).toEqual(["Redesign the Homepage hero"]);
  });

  it("finds comments by body text, with the item name attached", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "s2@test.dev",
      "s2-org",
    );
    const item = await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Client onboarding", groupId },
    });
    const itemId = item.json().item.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie },
      payload: { bodyText: "Waiting on the signed contract from legal" },
    });

    const res = await search(app, cookie, boardId, "contract");
    expect(res.statusCode).toBe(200);
    const hits = res.json().comments as { itemId: string; itemName: string }[];
    expect(hits).toHaveLength(1);
    expect(hits[0]!.itemId).toBe(itemId);
    expect(hits[0]!.itemName).toBe("Client onboarding");
  });

  it("does not return items or comments from a different board", async () => {
    const { cookie, boardId } = await setup(app, "s3a@test.dev", "s3-org");

    // A second board in the *same* org/workspace — same-org isolation is
    // a different bug class than cross-tenant (that's the next test).
    const workspaces = await app.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: { cookie },
    });
    const workspaceId = workspaces.json().workspaces[0].id as string;
    const otherBoardRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/boards`,
      headers: { cookie },
      payload: { name: "A different board", type: "main" },
    });
    const otherBoardId = otherBoardRes.json().board.id as string;
    const otherGroup = await app.inject({
      method: "POST",
      url: `/v1/boards/${otherBoardId}/groups`,
      headers: { cookie },
      payload: { title: "Backlog" },
    });
    await app.inject({
      method: "POST",
      url: `/v1/boards/${otherBoardId}/items`,
      headers: { cookie },
      payload: {
        name: "Quarterly budget review",
        groupId: otherGroup.json().group.id,
      },
    });

    const res = await search(app, cookie, boardId, "budget");
    expect(res.json().items).toEqual([]);
  });

  it("returns nothing for an empty query rather than everything", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "s4@test.dev",
      "s4-org",
    );
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Anything at all", groupId },
    });

    const res = await search(app, cookie, boardId, "");
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
    expect(res.json().comments).toEqual([]);
  });

  it("never shows one org's board search results to another org (cross-tenant isolation)", async () => {
    const a = await setup(app, "s5a@test.dev", "s5-org");
    await app.inject({
      method: "POST",
      url: `/v1/boards/${a.boardId}/items`,
      headers: { cookie: a.cookie },
      payload: { name: "Confidential roadmap", groupId: a.groupId },
    });
    const b = await signupWithWorkspace(app, "s5b@test.dev", "s5b-org");

    const res = await search(app, b.cookie, a.boardId, "confidential");
    expect(res.statusCode).toBe(404);
  });
});
