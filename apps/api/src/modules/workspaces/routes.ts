import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { workspaces, workspaceMembers } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { createWorkspaceSchema } from "./schemas.js";

/**
 * docs/04-api-design.md §2.3. Both routes demonstrate the actual point
 * of this task: every query here is scoped to `request.tenant.orgId`
 * both explicitly (the WHERE/insert value, the app-layer half of
 * tenancy) and via RLS (the DB-layer half, through withTenantContext) —
 * see docs/03-backend-architecture.md §4.
 */
export const workspacesRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/workspaces",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = createWorkspaceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          type: "https://docs.trellis.app/errors/validation",
          title: "Validation failed",
          status: 422,
          errors: parsed.error.issues,
        });
      }
      const { name, type } = parsed.data;
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const workspace = await withTenantContext(app.db, orgId, async (tx) => {
        const [created] = await tx
          .insert(workspaces)
          .values({
            orgId,
            name,
            type,
            // Placeholder ordering, not a real LexoRank implementation —
            // that belongs to the boards/views reordering feature, out
            // of scope here. Monotonic by creation order is enough for
            // "does tenancy scoping work".
            position: String(Date.now()),
            createdBy: userId,
          })
          .returning({
            id: workspaces.id,
            name: workspaces.name,
            type: workspaces.type,
          });

        await tx.insert(workspaceMembers).values({
          orgId,
          workspaceId: created.id,
          userId,
          isOwner: true,
        });

        return created;
      });

      return reply.code(201).send({ workspace });
    },
  );

  app.get(
    "/workspaces",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId } = request.tenant!;

      const rows = await withTenantContext(app.db, orgId, (tx) =>
        tx
          .select({
            id: workspaces.id,
            name: workspaces.name,
            type: workspaces.type,
          })
          .from(workspaces)
          // Explicit app-layer filter (03 §4) — belt-and-suspenders on
          // top of RLS, not a substitute for it.
          .where(eq(workspaces.orgId, orgId)),
      );

      return reply.send({ workspaces: rows });
    },
  );
};
