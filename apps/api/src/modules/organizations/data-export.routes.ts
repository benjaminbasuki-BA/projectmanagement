import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { ZipArchive } from "archiver";
import {
  boards as boardsTable,
  columns as columnsTable,
  items,
  columnValues,
  users,
} from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleBoard } from "../boards/index.js";
import { recordAuditEvent } from "../audit/index.js";
import { formatCellForCsv, csvEscape } from "../../lib/csv.js";

/**
 * docs/01 §2.8 admin console: "data export (all boards → CSV zip)".
 * One CSV per board the requesting user can actually see — a private
 * board they aren't a member of is silently skipped, same visibility
 * rule as everywhere else (getAccessibleBoard), not bypassed just
 * because this is "export everything."
 */
export const dataExportRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/org/export.zip",
    {
      preHandler: [app.authenticate, app.requireOrgContext],
      // Heavier than a normal request (N boards worth of queries) —
      // capped well below abuse territory but high enough for a person
      // clicking the button a few times while testing it.
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const files = await withTenantContext(app.db, orgId, async (tx) => {
        const boardRows = await tx
          .select({ id: boardsTable.id })
          .from(boardsTable)
          .where(
            and(eq(boardsTable.orgId, orgId), isNull(boardsTable.deletedAt)),
          );

        const out: { filename: string; csv: string }[] = [];
        const usedNames = new Set<string>();

        for (const { id: boardId } of boardRows) {
          const board = await getAccessibleBoard(tx, orgId, userId, boardId);
          if (!board) continue;

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

          const rows = await tx
            .select()
            .from(items)
            .where(and(eq(items.boardId, boardId), isNull(items.deletedAt)))
            .orderBy(items.position);

          const values = rows.length
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

          const valueByItemAndColumn = new Map<
            string,
            (typeof values)[number]
          >();
          for (const v of values) {
            valueByItemAndColumn.set(`${v.itemId}:${v.columnId}`, v);
          }

          const header = ["Item", ...boardColumns.map((c) => c.title)];
          const lines = [header.map(csvEscape).join(",")];
          for (const item of rows) {
            const cells = boardColumns.map((c) => {
              const cv = valueByItemAndColumn.get(`${item.id}:${c.id}`);
              return formatCellForCsv(c.type, cv, nameById);
            });
            lines.push([item.name, ...cells].map(csvEscape).join(","));
          }

          const base = board.name.replace(/[^\w.-]+/g, "_") || "board";
          let filename = `${base}.csv`;
          let suffix = 2;
          // Two boards can share a display name — de-dupe the zip entry
          // rather than letting one silently overwrite the other.
          while (usedNames.has(filename)) {
            filename = `${base}-${suffix}.csv`;
            suffix += 1;
          }
          usedNames.add(filename);

          out.push({ filename, csv: lines.join("\r\n") });
        }

        await recordAuditEvent(tx, {
          orgId,
          actorId: userId,
          actorIp: request.ip,
          event: "export.requested",
          targetType: "organization",
          targetId: orgId,
          metadata: { kind: "full_org_zip", boardCount: out.length },
        });

        return out;
      });

      reply.header("Content-Type", "application/zip");
      reply.header(
        "Content-Disposition",
        'attachment; filename="trellis-export.zip"',
      );

      const archive = new ZipArchive({ zlib: { level: 9 } });
      const streamed = reply.send(archive);
      for (const file of files) {
        archive.append(file.csv, { name: file.filename });
      }
      await archive.finalize();
      return streamed;
    },
  );
};
