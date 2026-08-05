import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";
import {
  signupWithWorkspace,
  signupPlain,
  addOrgMember,
} from "../../test/helpers.js";
import type { AppDb } from "../../db/types.js";

describe("workspace management", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("an admin can rename a workspace", async () => {
    const { cookie, workspaceId } = await signupWithWorkspace(
      app,
      "w1@test.dev",
      "w1-org",
    );

    const res = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}`,
      headers: { cookie },
      payload: { name: "Renamed Workspace" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspace.name).toBe("Renamed Workspace");

    const list = await app.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: { cookie },
    });
    expect(list.json().workspaces[0].name).toBe("Renamed Workspace");
  });

  it("a non-admin member cannot rename a workspace", async () => {
    const { orgId, workspaceId } = await signupWithWorkspace(
      app,
      "w2@test.dev",
      "w2-org",
    );
    const member = await signupPlain(app, "w2member@test.dev");
    await addOrgMember(db, orgId, member.userId);
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/select`,
      headers: { cookie: member.cookie },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}`,
      headers: { cookie: member.cookie },
      payload: { name: "Should not stick" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("never renames another org's workspace (cross-tenant isolation)", async () => {
    const a = await signupWithWorkspace(app, "w3a@test.dev", "w3-org");
    const b = await signupWithWorkspace(app, "w3b@test.dev", "w3b-org");

    const res = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${b.workspaceId}`,
      headers: { cookie: a.cookie },
      payload: { name: "Cross-tenant rename" },
    });
    expect(res.statusCode).toBe(404);
  });
});
