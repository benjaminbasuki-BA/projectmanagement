import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "./db.js";
import { buildServer } from "../server.js";

function extractCookie(setCookieHeader: string | string[] | undefined) {
  const header = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;
  if (!header) throw new Error("Expected a Set-Cookie header");
  return header.split(";")[0];
}

async function signup(app: FastifyInstance, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/signup",
    payload: { email, password: "correct-horse-battery", name: email },
  });
  return extractCookie(res.headers["set-cookie"]);
}

describe("org/workspace creation + tenancy scoping", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer(await createTestDb());
  });

  it("rejects workspace creation before an org is selected", async () => {
    const cookie = await signup(app, "no-org@northpeak.agency");

    const res = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie },
      payload: { name: "Client Work" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("creates an organization, admin membership, and pins it as the session's active org", async () => {
    const cookie = await signup(app, "priya@northpeak.agency");

    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: { cookie },
      payload: { name: "Northpeak Agency", slug: "northpeak-agency" },
    });
    expect(orgRes.statusCode).toBe(201);
    expect(orgRes.json().organization.slug).toBe("northpeak-agency");

    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie },
    });
    expect(me.json()).toMatchObject({
      organization: { slug: "northpeak-agency" },
      role: "admin",
    });
  });

  it("rejects a duplicate org slug", async () => {
    const cookieA = await signup(app, "first@dupslug.test");
    await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: { cookie: cookieA },
      payload: { name: "First Co", slug: "dupslug-co" },
    });

    const cookieB = await signup(app, "second@dupslug.test");
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: { cookie: cookieB },
      payload: { name: "Second Co", slug: "dupslug-co" },
    });

    expect(res.statusCode).toBe(409);
  });

  it("creates and lists workspaces scoped to the current org", async () => {
    const cookie = await signup(app, "acme@workspace.test");
    await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: { cookie },
      payload: { name: "Acme", slug: "acme-workspace-test" },
    });

    const create = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie },
      payload: { name: "Client Work", type: "open" },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().workspaces).toHaveLength(1);
    expect(list.json().workspaces[0].name).toBe("Client Work");
  });

  it("never shows one org's workspaces to another org (cross-tenant isolation)", async () => {
    const cookieA = await signup(app, "a@crosstenant.test");
    await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: { cookie: cookieA },
      payload: { name: "Org A", slug: "org-a-crosstenant" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie: cookieA },
      payload: { name: "Org A Workspace", type: "open" },
    });

    const cookieB = await signup(app, "b@crosstenant.test");
    await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: { cookie: cookieB },
      payload: { name: "Org B", slug: "org-b-crosstenant" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie: cookieB },
      payload: { name: "Org B Workspace", type: "open" },
    });

    const listA = await app.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: { cookie: cookieA },
    });
    const namesA = listA.json().workspaces.map((w: { name: string }) => w.name);
    expect(namesA).toEqual(["Org A Workspace"]);

    const listB = await app.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: { cookie: cookieB },
    });
    const namesB = listB.json().workspaces.map((w: { name: string }) => w.name);
    expect(namesB).toEqual(["Org B Workspace"]);
  });

  it("404s (not 403) when selecting an org you're not a member of", async () => {
    const cookieA = await signup(app, "owner@selecttest.test");
    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: { cookie: cookieA },
      payload: { name: "Owner Org", slug: "owner-org-selecttest" },
    });
    const orgId = orgRes.json().organization.id;

    const cookieB = await signup(app, "outsider@selecttest.test");
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/select`,
      headers: { cookie: cookieB },
    });

    expect(res.statusCode).toBe(404);
  });
});
