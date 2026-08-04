import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import {
  items,
  columns as columnsTable,
  columnValues,
  boardGroups,
  boards,
  organizations,
} from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleBoard } from "../boards/index.js";
import {
  createItemSchema,
  updateItemSchema,
  updateColumnValuesSchema,
} from "./schemas.js";
import { resolveColumnValue } from "./column-values.js";
import { conflict, notFound, validationError } from "../../lib/errors.js";
import type { AppDb } from "../../db/types.js";

const MAX_ITEMS_PER_BOARD = 20_000; // 01 §2.1 "20,000 items per board (hard)"
const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;

/** docs/02-data-model.md §3.1, §3.3, docs/04-api-design.md §2.5, §3.2-3.3. */
export const itemsRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/boards/:boardId/items",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = createItemSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const { name, groupId, columnValues: rawColumnValues } = parsed.data;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return { kind: "not-found" as const };

        if (board.itemCount >= MAX_ITEMS_PER_BOARD) {
          return { kind: "item-limit" as const };
        }

        const [group] = await tx
          .select({ id: boardGroups.id })
          .from(boardGroups)
          .where(
            and(eq(boardGroups.id, groupId), eq(boardGroups.boardId, boardId)),
          )
          .limit(1);
        if (!group) return { kind: "bad-group" as const };

        // Resolve + validate any provided cell values before writing
        // anything (02 Appendix A) — done up front so a bad value in
        // one cell doesn't leave a partially-created item behind.
        const resolvedValues: {
          columnId: string;
          value: Record<string, unknown>;
          textValue: string | null;
          numberValue: number | null;
          dateValue: Date | null;
        }[] = [];
        if (rawColumnValues) {
          const columnIds = Object.keys(rawColumnValues);
          const boardColumns = await tx
            .select()
            .from(columnsTable)
            .where(
              and(
                eq(columnsTable.boardId, boardId),
                isNull(columnsTable.deletedAt),
              ),
            );
          const byId = new Map(boardColumns.map((c) => [c.id, c]));

          for (const columnId of columnIds) {
            const column = byId.get(columnId);
            if (!column) {
              return { kind: "bad-column" as const, columnId };
            }
            const result = resolveColumnValue(
              column,
              rawColumnValues[columnId],
            );
            if (!result.success) {
              return {
                kind: "bad-value" as const,
                columnId,
                error: result.error,
              };
            }
            resolvedValues.push({ columnId, ...result.data });
          }
        }

        // display_seq: per-org counter, bumped atomically in the same
        // transaction (02 §1.1). No server-side DEFAULT exists for it —
        // same reasoning as the UUIDv7 id generation.
        const [{ itemDisplaySeq }] = await tx
          .update(organizations)
          .set({ itemDisplaySeq: sql`${organizations.itemDisplaySeq} + 1` })
          .where(eq(organizations.id, orgId))
          .returning({ itemDisplaySeq: organizations.itemDisplaySeq });

        const [created] = await tx
          .insert(items)
          .values({
            orgId,
            boardId,
            groupId,
            displaySeq: itemDisplaySeq,
            name,
            // Placeholder ordering — see workspaces/routes.ts's comment.
            position: String(Date.now()),
            createdBy: userId,
          })
          .returning();

        if (resolvedValues.length > 0) {
          await tx.insert(columnValues).values(
            resolvedValues.map((rv) => ({
              itemId: created.id,
              columnId: rv.columnId,
              orgId,
              boardId,
              value: rv.value,
              textValue: rv.textValue,
              numberValue: rv.numberValue?.toString(),
              dateValue: rv.dateValue,
              updatedBy: userId,
            })),
          );
        }

        // item_count is documented as trigger-maintained (02 §2.3), but
        // an app-layer increment inside this same transaction has the
        // same atomicity guarantee — see this task's summary.
        await tx
          .update(boards)
          .set({ itemCount: sql`${boards.itemCount} + 1` })
          .where(eq(boards.id, boardId));

        return { kind: "ok" as const, item: created };
      });

      switch (outcome.kind) {
        case "not-found":
          return notFound(reply);
        case "item-limit":
          return conflict(
            reply,
            422,
            "item_limit_reached",
            "This board already has the maximum of 20,000 items.",
          );
        case "bad-group":
          return validationErrorDetail(
            reply,
            "groupId",
            "Group does not belong to this board.",
          );
        case "bad-column":
          return validationErrorDetail(
            reply,
            `columnValues.${outcome.columnId}`,
            "Unknown column for this board.",
          );
        case "bad-value":
          return validationErrorDetail(
            reply,
            `columnValues.${outcome.columnId}`,
            outcome.error,
          );
        case "ok":
          return reply.code(201).send({ item: outcome.item });
      }
    },
  );

  app.get(
    "/boards/:boardId/items",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const query = request.query as {
        groupId?: string;
        limit?: string;
        include?: string;
      };
      const limit = clampLimit(query.limit);
      // docs/04 §2.5: heavy fields are opt-in on list endpoints via
      // ?include= — the table view needs every visible item's cells in
      // one request, not an N+1 fetch per row.
      const includeColumnValues = (query.include ?? "")
        .split(",")
        .includes("column_values");

      const result = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return null;

        const rows = await tx
          .select()
          .from(items)
          .where(
            and(
              eq(items.boardId, boardId),
              isNull(items.deletedAt),
              query.groupId ? eq(items.groupId, query.groupId) : undefined,
            ),
          )
          .orderBy(items.position)
          .limit(limit);

        if (!includeColumnValues || rows.length === 0) {
          return { rows, values: [] };
        }
        const values = await tx
          .select()
          .from(columnValues)
          .where(
            inArray(
              columnValues.itemId,
              rows.map((r) => r.id),
            ),
          );
        return { rows, values };
      });

      if (!result) return notFound(reply);
      // Simplified pagination: a flat limited page in position order, no
      // cursor. docs/04 §1's cursor convention needs a stable sort key
      // pair (position isn't unique) — real cursoring is a follow-up
      // once list views actually need to page past `limit`.
      return reply.send({
        items: result.rows,
        ...(includeColumnValues ? { columnValues: result.values } : {}),
        next_cursor: null,
      });
    },
  );

  app.get(
    "/items/:itemId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { itemId } = request.params as { itemId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const result = await withTenantContext(app.db, orgId, async (tx) => {
        const item = await getAccessibleItem(tx, orgId, userId, itemId);
        if (!item) return null;

        const values = await tx
          .select()
          .from(columnValues)
          .where(eq(columnValues.itemId, itemId));

        return { item, columnValues: values };
      });

      if (!result) return notFound(reply);
      return reply.send(result);
    },
  );

  app.patch(
    "/items/:itemId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = updateItemSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { itemId } = request.params as { itemId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const item = await withTenantContext(app.db, orgId, async (tx) => {
        const existing = await getAccessibleItem(tx, orgId, userId, itemId);
        if (!existing) return null;

        const [updated] = await tx
          .update(items)
          .set(parsed.data)
          .where(eq(items.id, itemId))
          .returning();
        return updated;
      });

      if (!item) return notFound(reply);
      return reply.send({ item });
    },
  );

  // The hot path (04 §2.5, §3.3): partial cell update(s) in one call.
  app.patch(
    "/items/:itemId/column-values",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = updateColumnValuesSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { itemId } = request.params as { itemId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const item = await getAccessibleItem(tx, orgId, userId, itemId);
        if (!item) return { kind: "not-found" as const };

        const columnIds = Object.keys(parsed.data);
        const boardColumns = await tx
          .select()
          .from(columnsTable)
          .where(
            and(
              eq(columnsTable.boardId, item.boardId),
              isNull(columnsTable.deletedAt),
            ),
          );
        const byId = new Map(boardColumns.map((c) => [c.id, c]));

        const resolved: {
          columnId: string;
          value: Record<string, unknown>;
          textValue: string | null;
          numberValue: number | null;
          dateValue: Date | null;
        }[] = [];
        for (const columnId of columnIds) {
          const column = byId.get(columnId);
          if (!column) {
            return { kind: "bad-column" as const, columnId };
          }
          const result = resolveColumnValue(column, parsed.data[columnId]);
          if (!result.success) {
            return {
              kind: "bad-value" as const,
              columnId,
              error: result.error,
            };
          }
          resolved.push({ columnId, ...result.data });
        }

        for (const rv of resolved) {
          await tx
            .insert(columnValues)
            .values({
              itemId,
              columnId: rv.columnId,
              orgId,
              boardId: item.boardId,
              value: rv.value,
              textValue: rv.textValue,
              numberValue: rv.numberValue?.toString(),
              dateValue: rv.dateValue,
              updatedBy: userId,
            })
            .onConflictDoUpdate({
              target: [columnValues.itemId, columnValues.columnId],
              set: {
                value: rv.value,
                textValue: rv.textValue,
                numberValue: rv.numberValue?.toString(),
                dateValue: rv.dateValue,
                updatedBy: userId,
                updatedAt: new Date(),
              },
            });
        }

        const values = await tx
          .select()
          .from(columnValues)
          .where(eq(columnValues.itemId, itemId));

        return { kind: "ok" as const, item, columnValues: values };
      });

      switch (outcome.kind) {
        case "not-found":
          return notFound(reply);
        case "bad-column":
          return validationErrorDetail(
            reply,
            outcome.columnId,
            "Unknown column for this item's board.",
          );
        case "bad-value":
          return validationErrorDetail(reply, outcome.columnId, outcome.error);
        case "ok":
          return reply.send({
            item: outcome.item,
            columnValues: outcome.columnValues,
          });
      }
    },
  );

  app.post(
    "/items/:itemId/archive",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { itemId } = request.params as { itemId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const item = await withTenantContext(app.db, orgId, async (tx) => {
        const existing = await getAccessibleItem(tx, orgId, userId, itemId);
        if (!existing) return null;

        const [updated] = await tx
          .update(items)
          .set({ archivedAt: new Date() })
          .where(eq(items.id, itemId))
          .returning();
        return updated;
      });

      if (!item) return notFound(reply);
      return reply.send({ item });
    },
  );

  app.delete(
    "/items/:itemId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { itemId } = request.params as { itemId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const deleted = await withTenantContext(app.db, orgId, async (tx) => {
        const existing = await getAccessibleItem(tx, orgId, userId, itemId);
        if (!existing) return null;

        const [updated] = await tx
          .update(items)
          .set({ deletedAt: new Date() })
          .where(eq(items.id, itemId))
          .returning({ id: items.id, boardId: items.boardId });

        if (updated) {
          await tx
            .update(boards)
            .set({ itemCount: sql`greatest(${boards.itemCount} - 1, 0)` })
            .where(eq(boards.id, updated.boardId));
        }
        return updated;
      });

      if (!deleted) return notFound(reply);
      return reply.code(204).send();
    },
  );
};

async function getAccessibleItem(
  tx: AppDb,
  orgId: string,
  userId: string,
  itemId: string,
) {
  const [item] = await tx
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), isNull(items.deletedAt)))
    .limit(1);
  if (!item) return null;

  const board = await getAccessibleBoard(tx, orgId, userId, item.boardId);
  if (!board) return null;

  return item;
}

function clampLimit(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : LIST_LIMIT_DEFAULT;
  if (!Number.isFinite(n) || n <= 0) return LIST_LIMIT_DEFAULT;
  return Math.min(n, LIST_LIMIT_MAX);
}

function validationErrorDetail(
  reply: Parameters<typeof notFound>[0],
  field: string,
  message: string,
) {
  return reply.code(422).send({
    type: "https://docs.trellis.app/errors/validation",
    title: "Validation failed",
    status: 422,
    errors: [{ path: [field], message }],
  });
}
