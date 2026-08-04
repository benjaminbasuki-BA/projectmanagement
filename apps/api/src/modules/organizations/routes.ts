import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { FastifyPluginAsync } from "fastify";
import { organizations, orgMemberships, users } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { setActiveOrg } from "../auth/index.js";
import { createOrganizationSchema } from "./schemas.js";

const DIRECTORY_LIMIT = 20;

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
