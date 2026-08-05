import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";
import { signup } from "../../test/helpers.js";
import type { AppDb } from "../../db/types.js";

describe("profile + session management", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("PATCH /users/me updates name/timezone/locale", async () => {
    const cookie = await signup(app, "p1@test.dev");

    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me",
      headers: { cookie },
      payload: { name: "New Name", timezone: "America/Los_Angeles" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.name).toBe("New Name");

    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie },
    });
    expect(me.json().user.name).toBe("New Name");
  });

  it("PATCH /users/me rejects an empty name", async () => {
    const cookie = await signup(app, "p2@test.dev");
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me",
      headers: { cookie },
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("GET /auth/sessions lists every active session and flags the current one", async () => {
    const cookie = await signup(app, "p3@test.dev");
    await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "p3@test.dev", password: "correct-horse-battery" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/sessions",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().sessions as { isCurrent: boolean }[];
    expect(list).toHaveLength(2);
    expect(list.filter((s) => s.isCurrent)).toHaveLength(1);
  });

  it("DELETE /auth/sessions signs out every other session but keeps the current one", async () => {
    const cookie = await signup(app, "p4@test.dev");
    await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "p4@test.dev", password: "correct-horse-battery" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "p4@test.dev", password: "correct-horse-battery" },
    });

    const before = await app.inject({
      method: "GET",
      url: "/v1/auth/sessions",
      headers: { cookie },
    });
    expect(before.json().sessions).toHaveLength(3);

    const revoke = await app.inject({
      method: "DELETE",
      url: "/v1/auth/sessions",
      headers: { cookie },
    });
    expect(revoke.statusCode).toBe(204);

    const after = await app.inject({
      method: "GET",
      url: "/v1/auth/sessions",
      headers: { cookie },
    });
    expect(after.json().sessions).toHaveLength(1);
    expect(after.json().sessions[0].isCurrent).toBe(true);
  });

  it("DELETE /auth/sessions/:id revokes one specific session by id", async () => {
    const cookie = await signup(app, "p5@test.dev");
    await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "p5@test.dev", password: "correct-horse-battery" },
    });

    const list = await app.inject({
      method: "GET",
      url: "/v1/auth/sessions",
      headers: { cookie },
    });
    const other = (
      list.json().sessions as { id: string; isCurrent: boolean }[]
    ).find((s) => !s.isCurrent)!;

    const res = await app.inject({
      method: "DELETE",
      url: `/v1/auth/sessions/${other.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);

    const after = await app.inject({
      method: "GET",
      url: "/v1/auth/sessions",
      headers: { cookie },
    });
    expect(after.json().sessions).toHaveLength(1);
  });

  it("DELETE /auth/sessions/:id refuses to revoke the caller's own current session", async () => {
    const cookie = await signup(app, "p6@test.dev");
    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/sessions",
      headers: { cookie },
    });
    const currentId = me.json().sessions[0].id as string;

    const res = await app.inject({
      method: "DELETE",
      url: `/v1/auth/sessions/${currentId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it("never reveals or revokes another user's session", async () => {
    const cookieA = await signup(app, "p7a@test.dev");
    const cookieB = await signup(app, "p7b@test.dev");

    const bSessions = await app.inject({
      method: "GET",
      url: "/v1/auth/sessions",
      headers: { cookie: cookieB },
    });
    const bSessionId = bSessions.json().sessions[0].id as string;

    const res = await app.inject({
      method: "DELETE",
      url: `/v1/auth/sessions/${bSessionId}`,
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(404);
  });
});
