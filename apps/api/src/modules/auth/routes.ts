import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { users, organizations, orgMemberships } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  createSession,
  revokeSession,
  setSessionCookie,
  clearSessionCookie,
  resumeLastActiveOrg,
} from "./sessions.js";
import { createTwoFactorChallenge } from "./two-factor.js";
import { mailTransport } from "./mailer.js";
import { googleOAuthConfigured } from "../../config/env.js";
import { signupSchema, loginSchema } from "./schemas.js";

/**
 * docs/04-api-design.md §2.1 (Auth). Email verification, Google OAuth,
 * 2FA, brute-force lockout, and the Pwned Passwords breach check are all
 * deferred — see the module-level note in this task's summary. What's
 * here is the part everything else depends on: signup, login, session
 * validation, logout.
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  /**
   * What this deployment actually supports. The web app renders sign-in
   * options from this rather than hard-coding them, so an unconfigured
   * provider is simply absent instead of a button that dead-ends
   * (doc 11 §K — MVP ships no dead buttons).
   */
  app.get("/auth/config", async (_request, reply) =>
    reply.send({
      providers: { google: googleOAuthConfigured },
      passwordMinLength: 10,
      emailDelivery: mailTransport,
    }),
  );

  app.post(
    "/auth/signup",
    // Bounds mass account creation from one address. Signup requires a
    // brand-new email so brute force isn't the risk — spam/abuse is.
    { config: { rateLimit: { max: 8, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = signupSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          type: "https://docs.trellis.app/errors/validation",
          title: "Validation failed",
          status: 422,
          errors: parsed.error.issues,
        });
      }
      const { email, password, name } = parsed.data;

      const [existing] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existing) {
        return reply.code(409).send({
          type: "https://docs.trellis.app/errors/conflict",
          title: "Conflict",
          status: 409,
          detail: "An account with this email already exists.",
        });
      }

      const passwordHash = await hashPassword(password);
      const [user] = await app.db
        .insert(users)
        .values({ email, name, passwordHash })
        .returning({ id: users.id, email: users.email, name: users.name });

      const { token } = await createSession(app.db, {
        userId: user.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
      setSessionCookie(reply, token);

      return reply.code(201).send({ user });
    },
  );

  app.post(
    "/auth/login",
    // The core brute-force defense: caps password guesses per IP well
    // below what a dictionary attack needs, independent of which account
    // is being guessed against.
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          type: "https://docs.trellis.app/errors/validation",
          title: "Validation failed",
          status: 422,
          errors: parsed.error.issues,
        });
      }
      const { email, password } = parsed.data;

      const [user] = await app.db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          passwordHash: users.passwordHash,
          deletedAt: users.deletedAt,
          totpEnabledAt: users.totpEnabledAt,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      // Same generic error whether the email doesn't exist or the password
      // is wrong — don't leak which one it was.
      const invalidCredentials = () =>
        reply.code(401).send({
          type: "https://docs.trellis.app/errors/unauthenticated",
          title: "Invalid credentials",
          status: 401,
        });

      if (!user || user.deletedAt || !user.passwordHash) {
        return invalidCredentials();
      }
      const valid = await verifyPassword(user.passwordHash, password);
      if (!valid) {
        return invalidCredentials();
      }

      // 2FA on: the password alone earns only a short-lived challenge, never
      // a session. No cookie is set until the second factor verifies
      // (see two-factor.ts).
      if (user.totpEnabledAt) {
        const { challenge, expiresAt } = await createTwoFactorChallenge(
          app.db,
          user.id,
        );
        return reply.send({
          twoFactorRequired: true,
          challenge,
          expiresAt: expiresAt.toISOString(),
        });
      }

      const { token, sessionId } = await createSession(app.db, {
        userId: user.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
      await resumeLastActiveOrg(app.db, user.id, sessionId);
      setSessionCookie(reply, token);

      return reply.send({
        user: { id: user.id, email: user.email, name: user.name },
      });
    },
  );

  app.post(
    "/auth/logout",
    { preHandler: app.authenticate },
    async (request, reply) => {
      await revokeSession(app.db, request.authSession!.sessionId);
      clearSessionCookie(reply);
      return reply.code(204).send();
    },
  );

  app.get(
    "/auth/me",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authSession = request.authSession!;

      // Security state the settings screen needs; cheap single-row read.
      const [security] = await app.db
        .select({
          totpEnabledAt: users.totpEnabledAt,
          passwordHash: users.passwordHash,
          googleSub: users.googleSub,
        })
        .from(users)
        .where(eq(users.id, authSession.user.id))
        .limit(1);

      const base = {
        user: authSession.user,
        activeOrgId: authSession.activeOrgId,
        twoFactorEnabled: Boolean(security?.totpEnabledAt),
        hasPassword: Boolean(security?.passwordHash),
        googleLinked: Boolean(security?.googleSub),
      };

      if (!authSession.activeOrgId) {
        return reply.send({ ...base, organization: null, role: null });
      }

      // Scoped read of the active org — see this file's header comment
      // on why "list every org I belong to" isn't supported yet.
      const orgId = authSession.activeOrgId;
      const [row] = await withTenantContext(app.db, orgId, (tx) =>
        tx
          .select({
            organization: {
              id: organizations.id,
              name: organizations.name,
              slug: organizations.slug,
            },
            role: orgMemberships.role,
          })
          .from(organizations)
          .innerJoin(orgMemberships, eq(orgMemberships.orgId, organizations.id))
          .where(eq(orgMemberships.userId, authSession.user.id))
          .limit(1),
      );

      return reply.send({
        ...base,
        organization: row?.organization ?? null,
        role: row?.role ?? null,
      });
    },
  );
};
