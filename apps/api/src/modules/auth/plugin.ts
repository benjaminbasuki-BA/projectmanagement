import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../../config/env.js";
import { validateSessionToken, clearSessionCookie } from "./sessions.js";

/**
 * Registers the `authenticate` preHandler as a decorator so routes opt
 * in explicitly: `app.get("/x", { preHandler: app.authenticate }, ...)`.
 * Resolves the session cookie into `request.authSession`; 401s otherwise.
 */
async function authPlugin(app: FastifyInstance) {
  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.cookies[env.SESSION_COOKIE_NAME];
      if (!token) {
        return reply.code(401).send({
          type: "https://docs.trellis.app/errors/unauthenticated",
          title: "Unauthenticated",
          status: 401,
          detail: "No session cookie present.",
        });
      }

      const authSession = await validateSessionToken(app.db, token);
      if (!authSession) {
        clearSessionCookie(reply);
        return reply.code(401).send({
          type: "https://docs.trellis.app/errors/unauthenticated",
          title: "Unauthenticated",
          status: 401,
          detail: "Session is invalid, expired, or revoked.",
        });
      }

      request.authSession = authSession;
    },
  );
}

export default fp(authPlugin, { name: "auth-plugin" });
