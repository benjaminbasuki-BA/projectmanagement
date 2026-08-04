import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "./db.js";

/**
 * The rate limiter is skipped when NODE_ENV==="test" (server.ts) because
 * the rest of the suite signs up/logs in far more than any real client
 * would from app.inject()'s single loopback address. This file is the
 * exception: it forces the limiter on by loading a fresh module graph
 * with NODE_ENV overridden, so the limits configured in routes.ts are
 * verified against real behavior rather than just trusted from config.
 */
describe("auth rate limiting", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://unused/unused");
    vi.stubEnv("APP_DATABASE_URL", "postgres://unused/unused");
    vi.stubEnv("TOTP_ENCRYPTION_KEY", "cmFuZG9tLTMyLWJ5dGUtdmFsdWUtZm9yLXRlc3RzISE=");
    const { buildServer } = await import("../server.js");
    app = await buildServer(await createTestDb());
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("locks out login after too many attempts from one client", async () => {
    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "nobody@example.com", password: "wrong-password" },
      });

    // routes.ts caps /auth/login at 10 requests / 5 minutes.
    for (let i = 0; i < 10; i++) {
      const res = await attempt();
      expect(res.statusCode).toBe(401);
    }

    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({
      title: "Too many requests",
      status: 429,
    });
  });

  it("does not throttle unrelated routes at the same volume", async () => {
    // health checks must survive whatever hammers the login endpoint.
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
    }
  });
});
