import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import {
  items,
  columns as columnsTable,
  columnValues,
  users,
} from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleBoard } from "../boards/index.js";
import { parseFilterParam, buildFilterCondition } from "./filter.js";
import { notFound, validationErrorDetail } from "../../lib/errors.js";

/**
 * docs/01 §2.4/§4.2, docs/11 "CSV import/export (MVP)" — export the
 * current view. No dedicated endpoint was ever specified in doc04 (a gap
 * — same situation the templates table and POST /organizations were in),
 * so this follows the existing items-list conventions: same `?filter=`
 * support as GET /boards/{id}/items, board access via the same helper.
 */
export const exportRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/boards/:boardId/export.csv",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const query = request.query as { filter?: string };

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return { kind: "not-found" as const };

        let filterCondition;
        const boardColumns = await tx
          .select()
          .from(columnsTable)
          .where(
            and(
              eq(columnsTable.boardId, boardId),
              isNull(columnsTable.deletedAt),
            ),
          )
          .orderBy(columnsTable.position);

        if (query.filter) {
          const parsed = parseFilterParam(query.filter);
          if (!parsed.success) {
            return { kind: "bad-filter" as const, error: parsed.error };
          }
          const columnsById = new Map(boardColumns.map((c) => [c.id, c]));
          const built = buildFilterCondition(
            tx,
            parsed.filter,
            columnsById,
            userId,
          );
          if (!built.success) {
            return { kind: "bad-filter" as const, error: built.error };
          }
          filterCondition = built.condition;
        }

        const rows = await tx
          .select()
          .from(items)
          .where(
            and(
              eq(items.boardId, boardId),
              isNull(items.deletedAt),
              filterCondition,
            ),
          )
          .orderBy(items.position);

        const values =
          rows.length > 0
            ? await tx
                .select()
                .from(columnValues)
                .where(
                  inArray(
                    columnValues.itemId,
                    rows.map((r) => r.id),
                  ),
                )
            : [];

        // Person columns store user ids, not names — resolve them all in
        // one query rather than showing an opaque uuid in the CSV.
        const personIds = new Set<string>();
        for (const v of values) {
          const raw = v.value as { user_ids?: string[] } | null;
          for (const id of raw?.user_ids ?? []) personIds.add(id);
        }
        const userRows = personIds.size
          ? await tx
              .select({ id: users.id, name: users.name })
              .from(users)
              .where(inArray(users.id, [...personIds]))
          : [];
        const nameById = new Map(userRows.map((u) => [u.id, u.name]));

        const valueByItemAndColumn = new Map<string, (typeof values)[number]>();
        for (const v of values) {
          valueByItemAndColumn.set(`${v.itemId}:${v.columnId}`, v);
        }

        return {
          kind: "ok" as const,
          board,
          columns: boardColumns,
          rows,
          valueByItemAndColumn,
          nameById,
        };
      });

      if (outcome.kind === "not-found") return notFound(reply);
      if (outcome.kind === "bad-filter") {
        return validationErrorDetail(reply, "filter", outcome.error);
      }

      const { board, columns, rows, valueByItemAndColumn, nameById } = outcome;
      const header = ["Item", ...columns.map((c) => c.title)];
      const lines = [header.map(csvEscape).join(",")];
      for (const item of rows) {
        const cells = columns.map((c) => {
          const cv = valueByItemAndColumn.get(`${item.id}:${c.id}`);
          return formatCellForCsv(c.type, cv, nameById);
        });
        lines.push([item.name, ...cells].map(csvEscape).join(","));
      }
      const csv = lines.join("\r\n");

      const filename = `${board.name.replace(/[^\w.-]+/g, "_")}.csv`;
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(csv);
    },
  );
};

function formatCellForCsv(
  type: string,
  cv: { value: unknown; textValue: string | null } | undefined,
  nameById: Map<string, string>,
): string {
  if (!cv) return "";
  const value = cv.value as Record<string, unknown>;
  switch (type) {
    case "status":
    case "dropdown":
    case "text":
    case "long_text":
      return cv.textValue ?? "";
    case "number":
      return typeof value.number === "number" ? String(value.number) : "";
    case "date":
      return typeof value.date === "string" ? value.date : "";
    case "checkbox":
      return value.checked ? "Yes" : "No";
    case "person": {
      const ids = (value.user_ids as string[] | undefined) ?? [];
      return ids.map((id) => nameById.get(id) ?? id).join("; ");
    }
    default:
      return cv.textValue ?? "";
  }
}

/** RFC 4180: quote a field if it contains a comma, quote, or newline. */
function csvEscape(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
