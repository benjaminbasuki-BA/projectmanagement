import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { workspaces, workspaceMembers } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { createWorkspaceSchema, updateWorkspaceSchema } from "./schemas.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { recordAuditEvent } from "../audit/index.js";

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

        await recordAuditEvent(tx, {
          orgId,
          actorId: userId,
          actorIp: request.ip,
          event: "workspace.created",
          targetType: "workspace",
          targetId: created.id,
          metadata: { name: created.name },
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

  // docs/01 §2.8 admin console "workspace management" — rename only;
  // creation/deletion of *multiple* workspaces is out of MVP scope
  // (CLAUDE.md: "single workspace per account"), so this covers the
  // one workspace-management action MVP actually needs.
  app.patch(
    "/workspaces/:id",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId, role } = request.tenant!;
      if (role !== "admin") {
        return forbidden(reply, "Only an admin can rename a workspace.");
      }
      const { id } = request.params as { id: string };
      const parsed = updateWorkspaceSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const [updated] = await withTenantContext(app.db, orgId, (tx) =>
        tx
          .update(workspaces)
          .set({ name: parsed.data.name })
          .where(and(eq(workspaces.id, id), eq(workspaces.orgId, orgId)))
          .returning({
            id: workspaces.id,
            name: workspaces.name,
            type: workspaces.type,
          }),
      );

      if (!updated) return notFound(reply);
      return reply.send({ workspace: updated });
    },
  );
};
