import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";

/** Pulls the session cookie's `name=value` pair out of a set-cookie header. */
function extractCookie(setCookieHeader: string | string[] | undefined) {
  const header = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;
  if (!header) throw new Error("Expected a Set-Cookie header");
  return header.split(";")[0];
}

describe("auth", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer(await createTestDb());
  });

  it("signup creates a user and sets a session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: {
        email: "priya@northpeak.agency",
        password: "correct-horse-battery",
        name: "Priya Raman",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().user.email).toBe("priya@northpeak.agency");
    expect(res.cookies.some((c) => c.name === "trellis_session")).toBe(true);
  });

  it("rejects signup with a duplicate email", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: {
        email: "dupe@northpeak.agency",
        password: "correct-horse-battery",
        name: "First",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: {
        email: "dupe@northpeak.agency",
        password: "another-password-here",
        name: "Second",
      },
    });

    expect(res.statusCode).toBe(409);
  });

  it("rejects signup with an invalid email or short password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { email: "not-an-email", password: "short", name: "X" },
    });

    expect(res.statusCode).toBe(422);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: {
        email: "login-test@northpeak.agency",
        password: "correct-horse-battery",
        name: "Login Test",
      },
    });

    const good = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "login-test@northpeak.agency",
        password: "correct-horse-battery",
      },
    });
    expect(good.statusCode).toBe(200);

    const badPassword = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "login-test@northpeak.agency",
        password: "wrong-password",
      },
    });
    expect(badPassword.statusCode).toBe(401);

    const noSuchUser = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "nobody@northpeak.agency",
        password: "whatever-12345",
      },
    });
    // Same status/shape as a wrong password — doesn't leak which one it was.
    expect(noSuchUser.statusCode).toBe(401);
    expect(noSuchUser.json()).toEqual(badPassword.json());
  });

  it("login resumes the user's most recent active organization", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: {
        email: "resume-org@northpeak.agency",
        password: "correct-horse-battery",
        name: "Resume Org",
      },
    });
    const signupCookie = extractCookie(signup.headers["set-cookie"]);

    const created = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: { cookie: signupCookie },
      payload: { name: "North Peak", slug: "north-peak-resume" },
    });
    const orgId = created.json().organization.id as string;

    // A fresh login (new session) should adopt that org automatically.
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "resume-org@northpeak.agency",
        password: "correct-horse-battery",
      },
    });
    const loginCookie = extractCookie(login.headers["set-cookie"]);

    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie: loginCookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().activeOrgId).toBe(orgId);
    expect(me.json().organization.name).toBe("North Peak");
  });

  it("rejects /auth/me without a session cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns the current user on /auth/me with a valid cookie", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: {
        email: "me-test@northpeak.agency",
        password: "correct-horse-battery",
        name: "Me Test",
      },
    });
    const cookie = extractCookie(signup.headers["set-cookie"]);

    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { email: "me-test@northpeak.agency" },
      activeOrgId: null,
      organization: null,
    });
  });

  it("logout revokes the session", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: {
        email: "logout-test@northpeak.agency",
        password: "correct-horse-battery",
        name: "Logout Test",
      },
    });
    const cookie = extractCookie(signup.headers["set-cookie"]);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);

    const meAfter = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie },
    });
    expect(meAfter.statusCode).toBe(401);
  });
});
