import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { items, comments } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleBoard } from "./access.js";
import { notFound } from "../../lib/errors.js";

const SEARCH_LIMIT = 20;

/**
 * Board-level ⌘K search (docs/01 §2.3, docs/03 §8): Postgres FTS over
 * `items.name` and `comments.body_text`, always ANDed with board access
 * — matching the GIN indexes in drizzle/0001 (`to_tsvector('simple', …)`
 * on both columns). `websearch_to_tsquery` accepts plain query syntax
 * ("quoted phrases", -exclusions) instead of tsquery's own operators, so
 * a search box can pass the raw string straight through.
 *
 * Global cross-workspace search is V1 (Meilisearch, 03 §8) — this is
 * deliberately board-scoped.
 */
export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/boards/:boardId/search",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const query = request.query as { q?: string };
      const q = (query.q ?? "").trim();

      if (!q) return reply.send({ items: [], comments: [] });

      const result = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return null;

        const matchedItems = await tx
          .select({
            id: items.id,
            name: items.name,
            displaySeq: items.displaySeq,
          })
          .from(items)
          .where(
            and(
              eq(items.boardId, boardId),
              isNull(items.deletedAt),
              sql`to_tsvector('simple', ${items.name}) @@ websearch_to_tsquery('simple', ${q})`,
            ),
          )
          .limit(SEARCH_LIMIT);

        const matchedComments = await tx
          .select({
            id: comments.id,
            itemId: comments.itemId,
            itemName: items.name,
            bodyText: comments.bodyText,
          })
          .from(comments)
          .innerJoin(items, eq(items.id, comments.itemId))
          .where(
            and(
              eq(items.boardId, boardId),
              isNull(items.deletedAt),
              isNull(comments.deletedAt),
              sql`to_tsvector('simple', ${comments.bodyText}) @@ websearch_to_tsquery('simple', ${q})`,
            ),
          )
          .limit(SEARCH_LIMIT);

        return { matchedItems, matchedComments };
      });

      if (!result) return notFound(reply);
      return reply.send({
        items: result.matchedItems,
        comments: result.matchedComments,
      });
    },
  );
};
