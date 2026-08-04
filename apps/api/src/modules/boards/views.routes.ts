import { and, count, eq, isNull, or } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { views } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleBoard } from "./access.js";
import { createViewSchema, updateViewSchema } from "./schemas.js";
import { conflict, notFound, validationError } from "../../lib/errors.js";

/** docs/02-data-model.md §4.1, docs/04-api-design.md §2.6 (form/share-link
 * parts of that section are V1 — this covers table/kanban views only). */
export const viewsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/boards/:boardId/views",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const result = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return null;

        // Shared views are visible to anyone on the board; personal
        // views only to their owner (docs/02 §4.1: "false ⇒ personal
        // (owner_id required)").
        return tx
          .select()
          .from(views)
          .where(
            and(
              eq(views.boardId, boardId),
              isNull(views.deletedAt),
              orDisplayable(views, userId),
            ),
          );
      });

      if (!result) return notFound(reply);
      return reply.send({ views: result });
    },
  );

  app.post(
    "/boards/:boardId/views",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = createViewSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const { type, name, isShared, settings } = parsed.data;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return { kind: "not-found" as const };

        const [{ value }] = await tx
          .select({ value: count(views.id) })
          .from(views)
          .where(and(eq(views.boardId, boardId), isNull(views.deletedAt)));
        // docs/02 §4.1: "max 50/board"
        if (value >= 50) return { kind: "limit" as const };

        const [created] = await tx
          .insert(views)
          .values({
            orgId,
            boardId,
            type,
            name,
            isShared,
            ownerId: isShared ? null : userId,
            settings,
            position: String(Date.now()),
          })
          .returning();
        return { kind: "ok" as const, view: created };
      });

      if (outcome.kind === "not-found") return notFound(reply);
      if (outcome.kind === "limit") {
        return conflict(
          reply,
          422,
          "view_limit_reached",
          "This board already has the maximum of 50 views.",
        );
      }
      return reply.code(201).send({ view: outcome.view });
    },
  );

  app.patch(
    "/views/:viewId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = updateViewSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { viewId } = request.params as { viewId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const view = await withTenantContext(app.db, orgId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(views)
          .where(eq(views.id, viewId))
          .limit(1);
        if (!existing) return null;
        const board = await getAccessibleBoard(
          tx,
          orgId,
          userId,
          existing.boardId,
        );
        if (!board) return null;
        // Personal views can only be edited by their owner — shared
        // views by anyone with board access (matching 01 §2.3: board
        // owners manage shared tabs; MVP doesn't yet have a narrower
        // "board owner only" check for shared views, see this task's
        // summary on deferred board-permission granularity).
        if (!existing.isShared && existing.ownerId !== userId) return null;

        const [updated] = await tx
          .update(views)
          .set(parsed.data)
          .where(eq(views.id, viewId))
          .returning();
        return updated;
      });

      if (!view) return notFound(reply);
      return reply.send({ view });
    },
  );

  app.delete(
    "/views/:viewId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { viewId } = request.params as { viewId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const view = await withTenantContext(app.db, orgId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(views)
          .where(eq(views.id, viewId))
          .limit(1);
        if (!existing) return null;
        const board = await getAccessibleBoard(
          tx,
          orgId,
          userId,
          existing.boardId,
        );
        if (!board) return null;
        if (!existing.isShared && existing.ownerId !== userId) return null;

        const [updated] = await tx
          .update(views)
          .set({ deletedAt: new Date() })
          .where(eq(views.id, viewId))
          .returning({ id: views.id });
        return updated;
      });

      if (!view) return notFound(reply);
      return reply.code(204).send();
    },
  );
};

/** `is_shared = true OR owner_id = :userId` as a reusable predicate. */
function orDisplayable(table: typeof views, userId: string) {
  return or(eq(table.isShared, true), eq(table.ownerId, userId));
}
