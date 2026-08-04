import { and, count, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { boardGroups } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleBoard } from "./access.js";
import { createGroupSchema, updateGroupSchema } from "./schemas.js";
import { conflict, notFound, validationError } from "../../lib/errors.js";

/** docs/02-data-model.md §2.5, docs/04-api-design.md §2.4. */
export const groupsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/boards/:boardId/groups",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const result = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return null;

        return tx
          .select()
          .from(boardGroups)
          .where(
            and(
              eq(boardGroups.boardId, boardId),
              isNull(boardGroups.archivedAt),
            ),
          );
      });

      if (!result) return notFound(reply);
      return reply.send({ groups: result });
    },
  );

  app.post(
    "/boards/:boardId/groups",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = createGroupSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return { kind: "not-found" as const };

        const [{ value }] = await tx
          .select({ value: count(boardGroups.id) })
          .from(boardGroups)
          .where(eq(boardGroups.boardId, boardId));
        // 01 §2.1: "max 200/board"
        if (value >= 200) return { kind: "limit" as const };

        const [created] = await tx
          .insert(boardGroups)
          .values({
            orgId,
            boardId,
            title: parsed.data.title,
            color: parsed.data.color,
            // Placeholder ordering — see workspaces/routes.ts's comment;
            // real LexoRank generation is a reordering-feature concern.
            position: String(Date.now()),
          })
          .returning();
        return { kind: "ok" as const, group: created };
      });

      if (outcome.kind === "not-found") return notFound(reply);
      if (outcome.kind === "limit") {
        return conflict(
          reply,
          422,
          "group_limit_reached",
          "This board already has the maximum of 200 groups.",
        );
      }
      return reply.code(201).send({ group: outcome.group });
    },
  );

  app.patch(
    "/groups/:groupId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = updateGroupSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { groupId } = request.params as { groupId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const group = await withTenantContext(app.db, orgId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(boardGroups)
          .where(eq(boardGroups.id, groupId))
          .limit(1);
        if (!existing) return null;
        const board = await getAccessibleBoard(
          tx,
          orgId,
          userId,
          existing.boardId,
        );
        if (!board) return null;

        const [updated] = await tx
          .update(boardGroups)
          .set(parsed.data)
          .where(eq(boardGroups.id, groupId))
          .returning();
        return updated;
      });

      if (!group) return notFound(reply);
      return reply.send({ group });
    },
  );

  app.delete(
    "/groups/:groupId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { groupId } = request.params as { groupId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const group = await withTenantContext(app.db, orgId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(boardGroups)
          .where(eq(boardGroups.id, groupId))
          .limit(1);
        if (!existing) return null;
        const board = await getAccessibleBoard(
          tx,
          orgId,
          userId,
          existing.boardId,
        );
        if (!board) return null;

        // board_groups has no deleted_at (docs/02 §2.5) — archived_at is
        // the soft-delete equivalent for this table.
        const [updated] = await tx
          .update(boardGroups)
          .set({ archivedAt: new Date() })
          .where(eq(boardGroups.id, groupId))
          .returning({ id: boardGroups.id });
        return updated;
      });

      if (!group) return notFound(reply);
      return reply.code(204).send();
    },
  );
};
