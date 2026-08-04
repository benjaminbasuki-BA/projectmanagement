import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { activityEvents, items, users } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleBoard } from "./access.js";
import { notFound } from "../../lib/errors.js";

const PAGE_LIMIT = 100;

// actorId is null for system/automation events (02 §5.3) — left join so
// those rows survive, with actorName coming back null rather than
// dropping the event.
const eventColumns = {
  id: activityEvents.id,
  boardId: activityEvents.boardId,
  itemId: activityEvents.itemId,
  actorId: activityEvents.actorId,
  actorName: users.name,
  eventType: activityEvents.eventType,
  payload: activityEvents.payload,
  boardSeq: activityEvents.boardSeq,
  createdAt: activityEvents.createdAt,
};

/**
 * docs/04-api-design.md §2.4: `GET /boards/{id}/activity?since_seq=&cursor=`
 * — board-wide history feed and the real-time resync cursor (03 §5).
 * `since_seq` returns everything strictly newer than a client's last-seen
 * `board_seq` (the resync case); omitted, it's a normal newest-first page.
 */
export const activityRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/boards/:boardId/activity",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const query = request.query as { since_seq?: string };
      const sinceSeq = query.since_seq
        ? Number.parseInt(query.since_seq, 10)
        : undefined;

      const result = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return null;

        return tx
          .select(eventColumns)
          .from(activityEvents)
          .leftJoin(users, eq(users.id, activityEvents.actorId))
          .where(
            and(
              eq(activityEvents.boardId, boardId),
              sinceSeq !== undefined
                ? gt(activityEvents.boardSeq, sinceSeq)
                : undefined,
            ),
          )
          .orderBy(
            sinceSeq !== undefined
              ? asc(activityEvents.boardSeq)
              : desc(activityEvents.boardSeq),
          )
          .limit(PAGE_LIMIT);
      });

      if (!result) return notFound(reply);
      return reply.send({ events: result, next_cursor: null });
    },
  );

  app.get(
    "/items/:itemId/activity",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { itemId } = request.params as { itemId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const result = await withTenantContext(app.db, orgId, async (tx) => {
        const [item] = await tx
          .select()
          .from(items)
          .where(and(eq(items.id, itemId), isNull(items.deletedAt)))
          .limit(1);
        if (!item) return null;

        const board = await getAccessibleBoard(tx, orgId, userId, item.boardId);
        if (!board) return null;

        return tx
          .select(eventColumns)
          .from(activityEvents)
          .leftJoin(users, eq(users.id, activityEvents.actorId))
          .where(eq(activityEvents.itemId, itemId))
          .orderBy(desc(activityEvents.createdAt))
          .limit(PAGE_LIMIT);
      });

      if (!result) return notFound(reply);
      return reply.send({ events: result });
    },
  );
};
