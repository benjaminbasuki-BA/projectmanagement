import { and, eq, ilike, isNull, ne, or } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { FastifyPluginAsync } from "fastify";
import {
  organizations,
  orgMemberships,
  users,
  sessions,
} from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { setActiveOrg, generateToken, hashToken } from "../auth/index.js";
import { recordAuditEvent } from "../audit/index.js";
import { sendMail } from "../../lib/mailer.js";
import { env } from "../../config/env.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  inviteMemberSchema,
  updateMemberSchema,
} from "./schemas.js";
import { inviteMail } from "./mailer.js";
import type { AppDb } from "../../db/types.js";

const DIRECTORY_LIMIT = 20;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (01 §2.8 console)

/** Admins can't demote/deactivate their way to an org with zero admins. */
async function countOtherActiveAdmins(
  tx: AppDb,
  orgId: string,
  excludingMembershipId: string,
): Promise<number> {
  const rows = await tx
    .select({ id: orgMemberships.id })
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.orgId, orgId),
        eq(orgMemberships.role, "admin"),
        isNull(orgMemberships.deactivatedAt),
        ne(orgMemberships.id, excludingMembershipId),
      ),
    );
  return rows.length;
}

/**
 * docs/04-api-design.md §2.2 documents `GET /org` / `PATCH /org` but no
 * `POST /organizations` — doc07 §1's onboarding flow clearly needs one
 * ("Creates the organizations row and Priya's admin org_memberships
 * row"), so this fills a real gap in doc04 rather than inventing scope
 * that isn't there. Flagged, same as the missing templates table caught
 * during the migrations task.
 */
export const organizationsRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/organizations",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = createOrganizationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          type: "https://docs.trellis.app/errors/validation",
          title: "Validation failed",
          status: 422,
          errors: parsed.error.issues,
        });
      }
      const { name, slug } = parsed.data;
      const userId = request.authSession!.user.id;

      // Generated up front (rather than left to a DB default — Postgres
      // 16 has no native UUIDv7 generator, see docs/02 §0) so it can
      // double as the RLS tenant context for the very transaction that
      // creates the row: WITH CHECK (id = current_setting('app.org_id'))
      // would otherwise have nothing to check against yet.
      const orgId = uuidv7();

      // No pre-check SELECT for an existing slug: organizations is
      // RLS-scoped per-org (0004_rls_policies.sql), so a SELECT here
      // could only ever see the org we're about to create, not any
      // *other* tenant's row — checking uniqueness "across all orgs"
      // isn't something the tenant-scoped app_user connection can do
      // via a read at all. The UNIQUE index on slug still enforces it
      // correctly regardless of RLS (constraint checks aren't filtered
      // by row visibility), so this relies on that and translates the
      // resulting 23505 into a 409 instead.
      let org;
      try {
        org = await withTenantContext(app.db, orgId, async (tx) => {
          const [created] = await tx
            .insert(organizations)
            .values({ id: orgId, name, slug })
            .returning({
              id: organizations.id,
              name: organizations.name,
              slug: organizations.slug,
              plan: organizations.plan,
            });

          await tx.insert(orgMemberships).values({
            orgId,
            userId,
            role: "admin",
          });

          return created;
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return reply.code(409).send({
            type: "https://docs.trellis.app/errors/conflict",
            title: "Conflict",
            status: 409,
            detail: "An organization with this slug already exists.",
          });
        }
        throw err;
      }

      await setActiveOrg(app.db, request.authSession!.sessionId, orgId);

      return reply.code(201).send({ organization: org });
    },
  );

  app.post(
    "/organizations/:id/select",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id: orgId } = request.params as { id: string };
      const userId = request.authSession!.user.id;

      // Same RLS-visibility check pattern as requireOrgContext
      // (middleware/tenant.ts): scope to the *claimed* org first, then
      // see if a real membership shows up.
      const [membership] = await withTenantContext(app.db, orgId, (tx) =>
        tx
          .select({ role: orgMemberships.role })
          .from(orgMemberships)
          .where(
            and(
              eq(orgMemberships.orgId, orgId),
              eq(orgMemberships.userId, userId),
              isNull(orgMemberships.deactivatedAt),
            ),
          )
          .limit(1),
      );

      if (!membership) {
        return reply.code(404).send({
          type: "https://docs.trellis.app/errors/not-found",
          title: "Not found",
          status: 404,
        });
      }

      await setActiveOrg(app.db, request.authSession!.sessionId, orgId);
      return reply.send({ activeOrgId: orgId, role: membership.role });
    },
  );

  // docs/04 §2.2: "Org directory" — the @mention autocomplete source
  // (items/comments.routes.ts validates mentions against this same
  // membership join, so a mention can never target someone the query
  // wouldn't have surfaced).
  app.get(
    "/users",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId } = request.tenant!;
      const query = request.query as { query?: string };
      const q = (query.query ?? "").trim();

      const rows = await withTenantContext(app.db, orgId, (tx) =>
        tx
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .innerJoin(orgMemberships, eq(orgMemberships.userId, users.id))
          .where(
            and(
              eq(orgMemberships.orgId, orgId),
              isNull(orgMemberships.deactivatedAt),
              q
                ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`))
                : undefined,
            ),
          )
          .limit(DIRECTORY_LIMIT),
      );

      return reply.send({ users: rows });
    },
  );

  // docs/04 §2.2: `GET /org` · `PATCH /org` — org settings screen.
  app.get(
    "/org",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId, role } = request.tenant!;

      const result = await withTenantContext(app.db, orgId, async (tx) => {
        const [org] = await tx
          .select({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
            plan: organizations.plan,
          })
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .limit(1);

        const members = await tx
          .select({ id: orgMemberships.id })
          .from(orgMemberships)
          .where(
            and(
              eq(orgMemberships.orgId, orgId),
              isNull(orgMemberships.deactivatedAt),
            ),
          );

        return { org, memberCount: members.length };
      });

      return reply.send({
        organization: { ...result.org, memberCount: result.memberCount },
        role,
      });
    },
  );

  app.patch(
    "/org",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId, role } = request.tenant!;
      if (role !== "admin") {
        return forbidden(
          reply,
          "Only an admin can update organization settings.",
        );
      }
      const parsed = updateOrganizationSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const [updated] = await withTenantContext(app.db, orgId, (tx) =>
        tx
          .update(organizations)
          .set({ name: parsed.data.name })
          .where(eq(organizations.id, orgId))
          .returning({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
            plan: organizations.plan,
          }),
      );

      return reply.send({ organization: updated });
    },
  );

  // docs/02 §1.1: "member list (invite by email, deactivate, change role)".
  app.get(
    "/org/members",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId } = request.tenant!;

      const rows = await withTenantContext(app.db, orgId, (tx) =>
        tx
          .select({
            id: orgMemberships.id,
            userId: orgMemberships.userId,
            role: orgMemberships.role,
            joinedAt: orgMemberships.joinedAt,
            deactivatedAt: orgMemberships.deactivatedAt,
            inviteEmail: orgMemberships.inviteEmail,
            inviteExpiresAt: orgMemberships.inviteExpiresAt,
            name: users.name,
            email: users.email,
          })
          .from(orgMemberships)
          .leftJoin(users, eq(users.id, orgMemberships.userId))
          .where(eq(orgMemberships.orgId, orgId))
          .orderBy(orgMemberships.joinedAt),
      );

      const members = rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        role: r.role,
        joinedAt: r.joinedAt,
        deactivatedAt: r.deactivatedAt,
        name: r.name,
        email: r.email ?? r.inviteEmail,
        invitePending: r.userId === null,
        inviteExpiresAt: r.inviteExpiresAt,
      }));

      return reply.send({ members });
    },
  );

  app.post(
    "/org/invites",
    {
      preHandler: [app.authenticate, app.requireOrgContext],
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const { orgId, role: callerRole } = request.tenant!;
      if (callerRole !== "admin") {
        return forbidden(reply, "Only an admin can invite members.");
      }
      const parsed = inviteMemberSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);
      const { email, role } = parsed.data;
      const inviterId = request.authSession!.user.id;
      const inviterName = request.authSession!.user.name;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        // An already-accepted member has inviteEmail cleared, so their
        // email only shows up via the users join, not orgMemberships
        // directly — check that first and bail before creating a
        // duplicate.
        const [activeMember] = await tx
          .select({ id: orgMemberships.id })
          .from(orgMemberships)
          .innerJoin(users, eq(users.id, orgMemberships.userId))
          .where(and(eq(orgMemberships.orgId, orgId), eq(users.email, email)));
        if (activeMember) {
          return { kind: "already-member" as const };
        }

        const [existing] = await tx
          .select({ id: orgMemberships.id })
          .from(orgMemberships)
          .where(
            and(
              eq(orgMemberships.orgId, orgId),
              eq(orgMemberships.inviteEmail, email),
              isNull(orgMemberships.userId),
            ),
          )
          .limit(1);

        const token = generateToken();
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

        if (existing) {
          // Pending invite already outstanding — refresh it (acts as resend).
          await tx
            .update(orgMemberships)
            .set({
              role,
              inviteTokenHash: tokenHash,
              inviteExpiresAt: expiresAt,
              invitedBy: inviterId,
            })
            .where(eq(orgMemberships.id, existing.id));
        } else {
          await tx.insert(orgMemberships).values({
            orgId,
            userId: null,
            role,
            invitedBy: inviterId,
            inviteEmail: email,
            inviteTokenHash: tokenHash,
            inviteExpiresAt: expiresAt,
          });
        }

        const [org] = await tx
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .limit(1);

        await recordAuditEvent(tx, {
          orgId,
          actorId: inviterId,
          actorIp: request.ip,
          event: "user.invited",
          targetType: "org_membership",
          metadata: { email, role },
        });

        return { kind: "ok" as const, orgName: org.name, token };
      });

      if (outcome.kind === "already-member") {
        return reply.code(409).send({
          type: "https://docs.trellis.app/errors/conflict",
          title: "Conflict",
          status: 409,
          detail: "This person is already a member of the organization.",
        });
      }

      const acceptUrl = `${env.APP_BASE_URL}/invite/${orgId}/${outcome.token}`;
      try {
        await sendMail(
          inviteMail(email, {
            orgName: outcome.orgName,
            inviterName,
            acceptUrl,
          }),
        );
      } catch (err) {
        request.log.error({ err }, "invite mail failed to send");
      }

      return reply.code(202).send({ message: "Invite sent." });
    },
  );

  app.patch(
    "/org/members/:id",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId, role: callerRole } = request.tenant!;
      if (callerRole !== "admin") {
        return forbidden(reply, "Only an admin can change member roles.");
      }
      const { id: membershipId } = request.params as { id: string };
      const parsed = updateMemberSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const [member] = await tx
          .select({
            id: orgMemberships.id,
            role: orgMemberships.role,
            userId: orgMemberships.userId,
          })
          .from(orgMemberships)
          .where(
            and(
              eq(orgMemberships.id, membershipId),
              eq(orgMemberships.orgId, orgId),
            ),
          )
          .limit(1);
        if (!member) return { kind: "not-found" as const };

        if (member.role === "admin" && parsed.data.role !== "admin") {
          const remaining = await countOtherActiveAdmins(tx, orgId, member.id);
          if (remaining === 0) {
            return { kind: "last-admin" as const };
          }
        }

        const [updated] = await tx
          .update(orgMemberships)
          .set({ role: parsed.data.role })
          .where(eq(orgMemberships.id, membershipId))
          .returning({
            id: orgMemberships.id,
            userId: orgMemberships.userId,
            role: orgMemberships.role,
          });

        await recordAuditEvent(tx, {
          orgId,
          actorId: request.authSession!.user.id,
          actorIp: request.ip,
          event: "user.role_changed",
          targetType: "user",
          targetId: member.userId ?? undefined,
          metadata: { membershipId, from: member.role, to: parsed.data.role },
        });

        return { kind: "ok" as const, member: updated };
      });

      if (outcome.kind === "not-found") return notFound(reply);
      if (outcome.kind === "last-admin") {
        return reply.code(409).send({
          type: "https://docs.trellis.app/errors/conflict",
          title: "Conflict",
          status: 409,
          detail: "The organization must keep at least one admin.",
        });
      }
      return reply.send({ member: outcome.member });
    },
  );

  app.delete(
    "/org/members/:id",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId, role: callerRole } = request.tenant!;
      if (callerRole !== "admin") {
        return forbidden(reply, "Only an admin can deactivate members.");
      }
      const { id: membershipId } = request.params as { id: string };

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const [member] = await tx
          .select({
            id: orgMemberships.id,
            role: orgMemberships.role,
            userId: orgMemberships.userId,
            deactivatedAt: orgMemberships.deactivatedAt,
          })
          .from(orgMemberships)
          .where(
            and(
              eq(orgMemberships.id, membershipId),
              eq(orgMemberships.orgId, orgId),
            ),
          )
          .limit(1);
        if (!member || member.deactivatedAt) {
          return { kind: "not-found" as const };
        }

        if (member.role === "admin") {
          const remaining = await countOtherActiveAdmins(tx, orgId, member.id);
          if (remaining === 0) return { kind: "last-admin" as const };
        }

        await tx
          .update(orgMemberships)
          .set({ deactivatedAt: new Date() })
          .where(eq(orgMemberships.id, membershipId));

        // A deactivated member shouldn't keep whatever sessions they're
        // already signed in with — same discipline as a password reset
        // (auth/password-reset.ts).
        if (member.userId) {
          await tx
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(sessions.userId, member.userId),
                isNull(sessions.revokedAt),
              ),
            );
        }

        await recordAuditEvent(tx, {
          orgId,
          actorId: request.authSession!.user.id,
          actorIp: request.ip,
          event: "user.deactivated",
          targetType: "user",
          targetId: member.userId ?? undefined,
          metadata: { membershipId },
        });

        return { kind: "ok" as const };
      });

      if (outcome.kind === "not-found") return notFound(reply);
      if (outcome.kind === "last-admin") {
        return reply.code(409).send({
          type: "https://docs.trellis.app/errors/conflict",
          title: "Conflict",
          status: 409,
          detail: "The organization must keep at least one admin.",
        });
      }
      return reply.code(204).send();
    },
  );

  // Public preview + accept for an emailed invite link. The org id rides
  // in the URL (rather than resolved from the token alone) because
  // org_memberships is RLS-protected — a tenant context has to be opened
  // with *some* org id before that table can be queried at all, and the
  // token itself (a 256-bit secret) is what proves the claimed org id is
  // the right one, not the URL by itself. Same trust shape as
  // POST /organizations/:id/select just above.
  app.get("/organizations/:orgId/invites/:token", async (request, reply) => {
    const { orgId, token } = request.params as {
      orgId: string;
      token: string;
    };

    const [invite] = await withTenantContext(app.db, orgId, (tx) =>
      tx
        .select({
          inviteEmail: orgMemberships.inviteEmail,
          inviteExpiresAt: orgMemberships.inviteExpiresAt,
          orgName: organizations.name,
        })
        .from(orgMemberships)
        .innerJoin(organizations, eq(organizations.id, orgMemberships.orgId))
        .where(
          and(
            eq(orgMemberships.orgId, orgId),
            eq(orgMemberships.inviteTokenHash, hashToken(token)),
            isNull(orgMemberships.userId),
          ),
        )
        .limit(1),
    );

    if (!invite || invite.inviteExpiresAt!.getTime() < Date.now()) {
      return notFound(reply);
    }

    const [existingUser] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invite.inviteEmail!))
      .limit(1);

    return reply.send({
      orgName: invite.orgName,
      email: invite.inviteEmail,
      hasAccount: Boolean(existingUser),
    });
  });

  app.post(
    "/organizations/:orgId/invites/:token/accept",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { orgId, token } = request.params as {
        orgId: string;
        token: string;
      };
      const authSession = request.authSession!;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const [invite] = await tx
          .select({
            id: orgMemberships.id,
            inviteEmail: orgMemberships.inviteEmail,
            inviteExpiresAt: orgMemberships.inviteExpiresAt,
          })
          .from(orgMemberships)
          .where(
            and(
              eq(orgMemberships.orgId, orgId),
              eq(orgMemberships.inviteTokenHash, hashToken(token)),
              isNull(orgMemberships.userId),
            ),
          )
          .limit(1);

        if (!invite || invite.inviteExpiresAt!.getTime() < Date.now()) {
          return { kind: "invalid" as const };
        }
        if (
          invite.inviteEmail!.toLowerCase() !==
          authSession.user.email.toLowerCase()
        ) {
          return { kind: "wrong-account" as const };
        }

        await tx
          .update(orgMemberships)
          .set({
            userId: authSession.user.id,
            joinedAt: new Date(),
            inviteEmail: null,
            inviteTokenHash: null,
            inviteExpiresAt: null,
          })
          .where(eq(orgMemberships.id, invite.id));

        return { kind: "ok" as const };
      });

      if (outcome.kind === "invalid") return notFound(reply);
      if (outcome.kind === "wrong-account") {
        return forbidden(
          reply,
          "This invite was sent to a different email address. Sign in with that account to accept it.",
        );
      }

      await setActiveOrg(app.db, authSession.sessionId, orgId);
      return reply.send({ activeOrgId: orgId });
    },
  );
};

/**
 * Postgres SQLSTATE 23505 (unique_violation). Drizzle wraps the driver's
 * raw error rather than exposing `.code` directly on the thrown error —
 * the real Postgres error (which does have `.code`) is on `.cause`.
 */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown; cause?: { code?: unknown } })?.code;
  const causeCode = (err as { cause?: { code?: unknown } })?.cause?.code;
  return code === "23505" || causeCode === "23505";
}
