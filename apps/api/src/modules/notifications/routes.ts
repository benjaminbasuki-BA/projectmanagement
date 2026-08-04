import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { notifications, boardMutes, users } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleBoard } from "../boards/index.js";
import { markReadSchema } from "./schemas.js";
import { notFound, validationError } from "../../lib/errors.js";

const PAGE_LIMIT = 50;

/** docs/04-api-design.md §2.11. All routes are implicitly "my notifications". */
export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/notifications",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const query = request.query as { unread?: string };
      const unreadOnly = query.unread === "true";

      const rows = await withTenantContext(app.db, orgId, (tx) =>
        tx
          .select({
            id: notifications.id,
            eventType: notifications.eventType,
            actorId: notifications.actorId,
            actorName: users.name,
            itemId: notifications.itemId,
            boardId: notifications.boardId,
            commentId: notifications.commentId,
            payload: notifications.payload,
            readAt: notifications.readAt,
            createdAt: notifications.createdAt,
          })
          .from(notifications)
          .leftJoin(users, eq(users.id, notifications.actorId))
          .where(
            and(
              eq(notifications.userId, userId),
              unreadOnly ? isNull(notifications.readAt) : undefined,
            ),
          )
          .orderBy(desc(notifications.createdAt))
          .limit(PAGE_LIMIT),
      );

      return reply.send({ notifications: rows, next_cursor: null });
    },
  );

  app.get(
    "/notifications/unread-count",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const [row] = await withTenantContext(app.db, orgId, (tx) =>
        tx
          .select({ count: count() })
          .from(notifications)
          .where(
            and(eq(notifications.userId, userId), isNull(notifications.readAt)),
          ),
      );

      return reply.send({ count: row?.count ?? 0 });
    },
  );

  app.post(
    "/notifications/mark-read",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = markReadSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      await withTenantContext(app.db, orgId, (tx) =>
        tx
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(notifications.userId, userId),
              inArray(notifications.id, parsed.data.ids),
            ),
          ),
      );

      return reply.code(204).send();
    },
  );

  app.post(
    "/notifications/mark-all-read",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      await withTenantContext(app.db, orgId, (tx) =>
        tx
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(eq(notifications.userId, userId), isNull(notifications.readAt)),
          ),
      );

      return reply.code(204).send();
    },
  );

  app.put(
    "/boards/:boardId/mute",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const ok = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return false;

        await tx
          .insert(boardMutes)
          .values({ orgId, userId, boardId })
          .onConflictDoNothing();
        return true;
      });

      if (!ok) return notFound(reply);
      return reply.code(204).send();
    },
  );

  app.delete(
    "/boards/:boardId/mute",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const ok = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return false;

        await tx
          .delete(boardMutes)
          .where(
            and(eq(boardMutes.boardId, boardId), eq(boardMutes.userId, userId)),
          );
        return true;
      });

      if (!ok) return notFound(reply);
      return reply.code(204).send();
    },
  );
};
