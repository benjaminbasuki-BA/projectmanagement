import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import {
  authPlugin,
  authRoutes,
  passwordResetRoutes,
  twoFactorRoutes,
  googleOAuthRoutes,
} from "./modules/auth/index.js";
import { organizationsRoutes } from "./modules/organizations/index.js";
import { workspacesRoutes } from "./modules/workspaces/index.js";
import { boardsModuleRoutes } from "./modules/boards/index.js";
import { itemsRoutes } from "./modules/items/index.js";
import tenantPlugin from "./middleware/tenant.js";
import type { AppDb } from "./db/types.js";

/**
 * Builds (but does not start) the Fastify app. Kept separate from the
 * listen() call in index.ts so this can be reused by tests without
 * binding a real port.
 *
 * `db` is injectable so the Vitest suite (test/db.ts) can hand this a
 * PGlite-backed instance instead of the real postgres-js connection in
 * db/client.ts — everything else about the app runs unmodified.
 */
export async function buildServer(db: AppDb) {
  const app = Fastify({
    logger:
      env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty" } }
        : env.NODE_ENV !== "test",
  });

  app.decorate("db", db);

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    // Required for the session cookie to travel cross-origin between
    // the Vite dev server (5173) and this API (3001) — see docs/03 §3.
    credentials: true,
    // @fastify/cors's default Access-Control-Allow-Methods omits PATCH,
    // which browsers enforce via preflight — the column-values hot path
    // (PATCH /items/:id/column-values) fails without this. Server-side
    // tests can't catch it: app.inject() never does a CORS preflight.
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });
  await app.register(cookie);

  // API-only process — no HTML is ever served, so CSP/COEP/COOP have
  // nothing to protect and just add noise. The headers that do matter for
  // a JSON API (HSTS, X-Content-Type-Options, X-Frame-Options,
  // Referrer-Policy) stay on.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
  });

  // Global safety net against runaway/scripted traffic. Auth's sensitive
  // endpoints (login, signup, password reset, 2FA verify) layer a much
  // tighter per-route limit on top of this — see routes.ts/
  // password-reset.ts/two-factor.ts. Skipped in tests: the suite signs up
  // and logs in far more than any real client would in the same window,
  // all from the same loopback address app.inject() uses, and there's no
  // dedicated rate-limit test (yet) that needs it enabled.
  //
  // In-memory store: fine for a single API instance. Once this deploys
  // with more than one instance behind the load balancer, swap in the
  // `redis` option (this plugin supports it directly) so limits are
  // shared instead of reset per-instance.
  if (env.NODE_ENV !== "test") {
    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: "1 minute",
      errorResponseBuilder: (_request, context) => ({
        type: "https://docs.trellis.app/errors/rate-limited",
        title: "Too many requests",
        status: 429,
        detail: `Retry in ${context.after}.`,
      }),
    });
  }

  await app.register(authPlugin);
  await app.register(tenantPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/v1" });
  await app.register(passwordResetRoutes, { prefix: "/v1" });
  await app.register(twoFactorRoutes, { prefix: "/v1" });
  await app.register(googleOAuthRoutes, { prefix: "/v1" });
  await app.register(organizationsRoutes, { prefix: "/v1" });
  await app.register(workspacesRoutes, { prefix: "/v1" });
  await app.register(boardsModuleRoutes, { prefix: "/v1" });
  await app.register(itemsRoutes, { prefix: "/v1" });

  return app;
}
