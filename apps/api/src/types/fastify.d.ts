// FastifyRequest is used below (authenticate/requireOrgContext param
// types), but this file's own `declare module` augmentation of
// FastifyRequest confuses eslint's usage tracking for the import.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { FastifyRequest, FastifyReply } from "fastify";
import type { AppDb } from "../db/types.js";
import type { AuthenticatedSession } from "../modules/auth/sessions.js";

declare module "fastify" {
  interface FastifyInstance {
    db: AppDb;
    /** preHandler: 401s unless a valid session cookie is present. */
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    /**
     * preHandler: 403/404s unless the session has a valid active org.
     * Must run after `authenticate`. See middleware/tenant.ts.
     */
    requireOrgContext: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }

  interface FastifyRequest {
    /** Set by the `authenticate` preHandler (modules/auth/plugin.ts). */
    authSession?: AuthenticatedSession;
    /**
     * Set by the `requireOrgContext` preHandler (middleware/tenant.ts),
     * which runs after `authenticate`. Only present on routes that
     * opted into org scoping.
     */
    tenant?: { orgId: string; role: string };
  }
}
