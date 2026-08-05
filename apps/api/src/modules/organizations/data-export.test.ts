import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import AdmZip from "adm-zip";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";
import { signupWithWorkspace } from "../../test/helpers.js";
import type { AppDb } from "../../db/types.js";

async function setup(app: FastifyInstance, email: string, slug: string) {
  const { cookie, workspaceId } = await signupWithWorkspace(app, email, slug);
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
  return { cookie, boardId, groupId };
}

describe("full data export (all boards -> CSV zip)", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("zips one CSV per accessible board", async () => {
    const { cookie, boardId, groupId } = await setup(
      app,
      "d1@test.dev",
      "d1-org",
    );
    await app.inject({
      method: "POST",
      url: `/v1/boards/${boardId}/items`,
      headers: { cookie },
      payload: { name: "Exported item", groupId },
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/org/export.zip",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(res.headers["content-disposition"]).toContain("attachment");

    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].entryName).toBe("Export_Test_Board.csv");
    const csv = zip.readAsText(entries[0]);
    expect(csv.trim().split("\r\n")).toEqual(["Item", "Exported item"]);
  });

  it("skips a private board the requesting user isn't a member of", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "d2@test.dev",
      "d2-org",
    );

    const publicBoard = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/boards`,
      headers: { cookie },
      payload: { name: "Public Board", type: "main" },
    });
    const privateBoard = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/boards`,
      headers: { cookie },
      payload: { name: "Private Board", type: "private" },
    });
    expect(publicBoard.statusCode).toBe(201);
    expect(privateBoard.statusCode).toBe(201);

    const res = await app.inject({
      method: "GET",
      url: "/v1/org/export.zip",
      headers: { cookie },
    });
    const zip = new AdmZip(res.rawPayload);
    const names = zip.getEntries().map((e) => e.entryName);
    // The board's own creator is implicitly a board_members row on a
    // private board, so both should be visible here — this asserts the
    // export doesn't silently drop boards the caller *can* see.
    expect(names).toContain("Public_Board.csv");
    expect(names).toContain("Private_Board.csv");
  });

  it("de-dupes zip entry names when two boards share a display name", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "d3@test.dev",
      "d3-org",
    );
    await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/boards`,
      headers: { cookie },
      payload: { name: "Same Name", type: "main" },
    });
    await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/boards`,
      headers: { cookie },
      payload: { name: "Same Name", type: "main" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/org/export.zip",
      headers: { cookie },
    });
    const names = new AdmZip(res.rawPayload)
      .getEntries()
      .map((e) => e.entryName);
    expect(names.sort()).toEqual(["Same_Name-2.csv", "Same_Name.csv"]);
  });

  it("never includes another org's boards (cross-tenant isolation)", async () => {
    const a = await setup(app, "d4a@test.dev", "d4-org");
    await setup(app, "d4b@test.dev", "d4b-org");

    const res = await app.inject({
      method: "GET",
      url: "/v1/org/export.zip",
      headers: { cookie: a.cookie },
    });
    const names = new AdmZip(res.rawPayload)
      .getEntries()
      .map((e) => e.entryName);
    expect(names).toEqual(["Export_Test_Board.csv"]);
  });
});
