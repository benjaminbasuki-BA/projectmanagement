import fp from "fastify-plugin";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { orgMemberships } from "../db/schema/index.js";
import { withTenantContext } from "../db/tenant-db.js";

/**
 * docs/03-backend-architecture.md §4 permission resolution: "if m.role ==
 * 'guest' → require board_members row"; more generally, every request
 * resolves a TenantContext {org_id, user_id, role} before touching
 * tenant data. This is that resolution step.
 *
 * Must run after `authenticate` (needs request.authSession).
 *
 * - No active org selected on the session → 403 (the user is
 *   authenticated but hasn't created/selected an organization yet —
 *   distinct from a cross-tenant access attempt).
 * - Active org set, but no matching org_membership (removed, or a
 *   forged/stale org id) → 404, never 403 (03 §4: "Cross-tenant access
 *   must 404, never 403 — don't leak existence").
 */
async function tenantPlugin(app: FastifyInstance) {
  app.decorate(
    "requireOrgContext",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authSession = request.authSession;
      if (!authSession) {
        // Programmer error (route forgot `authenticate` first), not a
        // client-facing case — fail loudly rather than 401 here.
        throw new Error(
          "requireOrgContext used without authenticate running first",
        );
      }

      if (!authSession.activeOrgId) {
        return reply.code(403).send({
          type: "https://docs.trellis.app/errors/no-active-organization",
          title: "No active organization",
          status: 403,
          detail:
            "This session has no organization selected. Create or select one first.",
        });
      }

      // org_memberships is RLS-protected (0004_rls_policies.sql), so this
      // lookup has to run with app.org_id already set to the *claimed*
      // org — otherwise RLS itself would hide the row we're checking
      // for, even for a legitimate membership. Setting it to the claimed
      // org and then filtering by orgId again (redundant with RLS, but
      // explicit per the app-layer half of tenancy, 03 §4) is safe: a
      // forged/nonexistent org id just means RLS+filter both find
      // nothing, which is exactly the "not a member" outcome we want.
      const authOrgId = authSession.activeOrgId;
      const [membership] = await withTenantContext(app.db, authOrgId, (tx) =>
        tx
          .select({ role: orgMemberships.role })
          .from(orgMemberships)
          .where(
            and(
              eq(orgMemberships.orgId, authOrgId),
              eq(orgMemberships.userId, authSession.user.id),
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

      request.tenant = {
        orgId: authSession.activeOrgId,
        role: membership.role,
      };
    },
  );
}

export default fp(tenantPlugin, {
  name: "tenant-plugin",
  dependencies: ["auth-plugin"],
});
