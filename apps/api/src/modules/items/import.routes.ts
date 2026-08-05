import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
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
import { resolveColumnValue } from "./column-values.js";
import { recordActivity } from "../../lib/activity.js";
import {
  conflict,
  notFound,
  validationError,
  validationErrorDetail,
} from "../../lib/errors.js";

const MAX_IMPORT_ROWS = 500; // matches doc04 §3.5's batch-op cap

const importSchema = z.object({
  groupId: z.string().uuid(),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        columnValues: z.record(z.string().uuid(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(MAX_IMPORT_ROWS),
});

/**
 * docs/01 §2.4/§4.2, docs/11 "CSV import wizard (MVP)". CSV parsing and
 * column mapping both happen client-side (features/boards/
 * CsvImportWizard.tsx) — by the time a request reaches here it's just
 * "create these items with these already-mapped column values," so this
 * reuses items.routes.ts's single-create validation (resolveColumnValue)
 * per row rather than trusting the client's type inference.
 *
 * All-or-nothing: every row is validated before any row is written, so
 * one bad cell in a 500-row import doesn't leave a partial board.
 *
 * Deliberately skips two things a single POST /items does: subscribing
 * the creator (doc02 §3.7) — importing 500 items shouldn't subscribe the
 * importer to 500 items' worth of future notifications — and a
 * recordActivity call per item, replaced by one aggregate
 * "items.imported" event instead of hundreds of individual
 * "item.created" ones.
 */
export const importRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/boards/:boardId/import",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = importSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const { groupId, items: rows } = parsed.data;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return { kind: "not-found" as const };

        if (board.itemCount + rows.length > 20_000) {
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

        const boardColumns = await tx
          .select()
          .from(columnsTable)
          .where(
            and(
              eq(columnsTable.boardId, boardId),
              isNull(columnsTable.deletedAt),
            ),
          );
        const columnsById = new Map(boardColumns.map((c) => [c.id, c]));

        // Validate every row before writing anything.
        const resolvedRows: {
          name: string;
          values: {
            columnId: string;
            value: Record<string, unknown>;
            textValue: string | null;
            numberValue: number | null;
            dateValue: Date | null;
          }[];
        }[] = [];
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex]!;
          const values: (typeof resolvedRows)[number]["values"] = [];
          for (const [columnId, raw] of Object.entries(
            row.columnValues ?? {},
          )) {
            const column = columnsById.get(columnId);
            if (!column) {
              return {
                kind: "bad-row" as const,
                rowIndex,
                field: `columnValues.${columnId}`,
                error: "Unknown column for this board.",
              };
            }
            const result = resolveColumnValue(column, raw);
            if (!result.success) {
              return {
                kind: "bad-row" as const,
                rowIndex,
                field: `columnValues.${columnId}`,
                error: result.error,
              };
            }
            values.push({ columnId, ...result.data });
          }
          resolvedRows.push({ name: row.name, values });
        }

        const createdIds: string[] = [];
        for (const row of resolvedRows) {
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
              name: row.name,
              position: String(Date.now() + createdIds.length),
              createdBy: userId,
            })
            .returning({ id: items.id });

          if (row.values.length > 0) {
            await tx.insert(columnValues).values(
              row.values.map((rv) => ({
                itemId: created!.id,
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
          createdIds.push(created!.id);
        }

        await tx
          .update(boards)
          .set({ itemCount: sql`${boards.itemCount} + ${createdIds.length}` })
          .where(eq(boards.id, boardId));

        await recordActivity(tx, {
          orgId,
          boardId,
          actorId: userId,
          eventType: "items.imported",
          payload: { count: createdIds.length, groupId },
        });

        return { kind: "ok" as const, count: createdIds.length };
      });

      switch (outcome.kind) {
        case "not-found":
          return notFound(reply);
        case "item-limit":
          return conflict(
            reply,
            422,
            "item_limit_reached",
            "This import would put the board over the 20,000-item limit.",
          );
        case "bad-group":
          return validationErrorDetail(
            reply,
            "groupId",
            "Group does not belong to this board.",
          );
        case "bad-row":
          return validationErrorDetail(
            reply,
            `items[${outcome.rowIndex}].${outcome.field}`,
            outcome.error,
          );
        case "ok":
          return reply.code(201).send({ count: outcome.count });
      }
    },
  );
};
