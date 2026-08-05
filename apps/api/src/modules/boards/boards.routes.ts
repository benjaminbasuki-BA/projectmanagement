import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  boards,
  boardMembers,
  boardGroups,
  columns as columnsTable,
  items,
  columnValues,
  organizations,
} from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleWorkspace, getAccessibleBoard } from "./access.js";
import { createBoardSchema, updateBoardSchema } from "./schemas.js";
import { conflict, notFound, validationError } from "../../lib/errors.js";
import { getTemplate, type BoardTemplate } from "./templates.js";
import type { AppDb } from "../../db/types.js";

/** docs/04-api-design.md §2.4 (board-level routes; groups/columns/views
 * are in their own files in this module). */
export const boardsRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/workspaces/:workspaceId/boards",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = createBoardSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { workspaceId } = request.params as { workspaceId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const { name, description, type, templateId } = parsed.data;

      const template = templateId ? getTemplate(templateId) : undefined;
      if (templateId && !template) {
        return conflict(
          reply,
          422,
          "unknown-template",
          `No starter template with id "${templateId}".`,
        );
      }

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const workspace = await getAccessibleWorkspace(
          tx,
          orgId,
          userId,
          workspaceId,
        );
        if (!workspace) return { kind: "not-found" as const };

        const [created] = await tx
          .insert(boards)
          .values({
            orgId,
            workspaceId,
            name,
            description,
            type,
            ownerId: userId,
          })
          .returning();

        // Private boards need an explicit membership row to be visible
        // to anyone at all (access.ts); main boards don't (workspace
        // access grants them implicitly, docs/02 §2.4).
        if (type === "private") {
          await tx.insert(boardMembers).values({
            orgId,
            boardId: created.id,
            userId,
            isOwner: true,
          });
        }

        if (template) {
          await instantiateTemplate(tx, orgId, userId, created.id, template);
          // `created` is the pre-instantiation insert result — itemCount
          // was still its 0 default at that point, so it needs to reflect
          // what instantiateTemplate just set, not what the INSERT saw.
          created.itemCount = template.items.length;
        }

        return { kind: "ok" as const, board: created };
      });

      if (outcome.kind === "not-found") return notFound(reply);
      return reply.code(201).send({ board: outcome.board });
    },
  );

  app.get(
    "/workspaces/:workspaceId/boards",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const includeArchived =
        (request.query as { state?: string }).state === "archived";

      const result = await withTenantContext(app.db, orgId, async (tx) => {
        const workspace = await getAccessibleWorkspace(
          tx,
          orgId,
          userId,
          workspaceId,
        );
        if (!workspace) return null;

        const rows = await tx
          .select()
          .from(boards)
          .where(
            and(
              eq(boards.workspaceId, workspaceId),
              eq(boards.orgId, orgId),
              isNull(boards.deletedAt),
              includeArchived ? undefined : isNull(boards.archivedAt),
            ),
          );

        // Main boards are visible to anyone with workspace access
        // (already established above); private boards need the
        // per-board membership check too — filtered here in application
        // code rather than the query itself, matching 03 §4's layered
        // model instead of collapsing it into one SQL WHERE clause.
        const visible = [];
        for (const board of rows) {
          if (board.type === "main") {
            visible.push(board);
            continue;
          }
          const accessible = await getAccessibleBoard(
            tx,
            orgId,
            userId,
            board.id,
          );
          if (accessible) visible.push(board);
        }
        return visible;
      });

      if (!result) return notFound(reply);
      return reply.send({ boards: result });
    },
  );

  app.get(
    "/boards/:boardId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const board = await withTenantContext(app.db, orgId, (tx) =>
        getAccessibleBoard(tx, orgId, userId, boardId),
      );
      if (!board) return notFound(reply);
      return reply.send({ board });
    },
  );

  app.patch(
    "/boards/:boardId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = updateBoardSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const board = await withTenantContext(app.db, orgId, async (tx) => {
        const existing = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!existing) return null;

        const [updated] = await tx
          .update(boards)
          .set(parsed.data)
          .where(eq(boards.id, boardId))
          .returning();
        return updated;
      });

      if (!board) return notFound(reply);
      return reply.send({ board });
    },
  );

  app.post(
    "/boards/:boardId/archive",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    (request, reply) => archiveBoard(app.db, request, reply, true),
  );

  app.post(
    "/boards/:boardId/unarchive",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    (request, reply) => archiveBoard(app.db, request, reply, false),
  );

  app.delete(
    "/boards/:boardId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const deleted = await withTenantContext(app.db, orgId, async (tx) => {
        const existing = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!existing) return null;

        const [updated] = await tx
          .update(boards)
          .set({ deletedAt: new Date() })
          .where(eq(boards.id, boardId))
          .returning({ id: boards.id });
        return updated;
      });

      if (!deleted) return notFound(reply);
      return reply.code(204).send();
    },
  );
};

async function archiveBoard(
  db: AppDb,
  request: FastifyRequest,
  reply: FastifyReply,
  archived: boolean,
) {
  const { boardId } = request.params as { boardId: string };
  const { orgId } = request.tenant!;
  const userId = request.authSession!.user.id;

  const board = await withTenantContext(db, orgId, async (tx) => {
    const existing = await getAccessibleBoard(tx, orgId, userId, boardId);
    if (!existing) return null;

    const [updated] = await tx
      .update(boards)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(boards.id, boardId))
      .returning();
    return updated;
  });

  if (!board) return notFound(reply);
  return reply.send({ board });
}

/**
 * Populates a freshly created (still-empty) board with a starter
 * template's groups, columns, and sample items, all inside the caller's
 * transaction. Trusted static content (templates.ts), not user input —
 * so this skips the request-time validation items.routes.ts runs on a
 * real POST /items, but still derives text_value/number_value/date_value
 * the same way (Appendix A) so filtering/sorting on templated items
 * works identically to hand-created ones.
 */
async function instantiateTemplate(
  tx: AppDb,
  orgId: string,
  userId: string,
  boardId: string,
  template: BoardTemplate,
) {
  const groupIds: string[] = [];
  for (let i = 0; i < template.groups.length; i++) {
    const g = template.groups[i]!;
    const [row] = await tx
      .insert(boardGroups)
      .values({
        orgId,
        boardId,
        title: g.title,
        color: g.color,
        position: String(Date.now() + i),
      })
      .returning({ id: boardGroups.id });
    groupIds.push(row!.id);
  }

  const columnIds: string[] = [];
  for (let i = 0; i < template.columns.length; i++) {
    const c = template.columns[i]!;
    const [row] = await tx
      .insert(columnsTable)
      .values({
        orgId,
        boardId,
        title: c.title,
        type: c.type,
        settings: c.settings ?? {},
        position: String(Date.now() + i),
      })
      .returning({ id: columnsTable.id });
    columnIds.push(row!.id);
  }
  const firstPersonColumnIndex = template.columns.findIndex(
    (c) => c.type === "person",
  );

  for (let i = 0; i < template.items.length; i++) {
    const item = template.items[i]!;
    const [{ itemDisplaySeq }] = await tx
      .update(organizations)
      .set({ itemDisplaySeq: sql`${organizations.itemDisplaySeq} + 1` })
      .where(eq(organizations.id, orgId))
      .returning({ itemDisplaySeq: organizations.itemDisplaySeq });

    const [createdItem] = await tx
      .insert(items)
      .values({
        orgId,
        boardId,
        groupId: groupIds[item.groupIndex]!,
        displaySeq: itemDisplaySeq,
        name: item.name,
        position: String(Date.now() + i),
        createdBy: userId,
      })
      .returning({ id: items.id });

    const values = { ...item.values };
    if (item.assignToCreator && firstPersonColumnIndex >= 0) {
      values[firstPersonColumnIndex] ??= { user_ids: [userId] };
    }

    for (const [columnIndexStr, raw] of Object.entries(values)) {
      const column = template.columns[Number(columnIndexStr)]!;
      const extracted = extractTemplateValue(column, raw);
      await tx.insert(columnValues).values({
        itemId: createdItem!.id,
        columnId: columnIds[Number(columnIndexStr)]!,
        orgId,
        boardId,
        value: extracted.value,
        textValue: extracted.textValue,
        numberValue: extracted.numberValue?.toString(),
        dateValue: extracted.dateValue,
        updatedBy: userId,
      });
    }
  }

  await tx
    .update(boards)
    .set({ itemCount: template.items.length })
    .where(eq(boards.id, boardId));
}

/** Appendix A extraction (docs/02), trusted-input version — see
 * items/column-values.ts's resolveColumnValue for the validated one. */
function extractTemplateValue(
  column: BoardTemplate["columns"][number],
  raw: unknown,
): {
  value: Record<string, unknown>;
  textValue: string | null;
  numberValue: number | null;
  dateValue: Date | null;
} {
  const value = raw as Record<string, unknown>;
  switch (column.type) {
    case "status": {
      const labels = (column.settings?.labels ?? []) as {
        id: string;
        text: string;
      }[];
      const label = labels.find((l) => l.id === value.label_id);
      return {
        value,
        textValue: label?.text ?? null,
        numberValue: null,
        dateValue: null,
      };
    }
    case "text":
    case "long_text":
      return {
        value,
        textValue: (value.text as string) ?? null,
        numberValue: null,
        dateValue: null,
      };
    case "number":
      return {
        value,
        textValue: null,
        numberValue: (value.number as number) ?? null,
        dateValue: null,
      };
    case "person":
      return { value, textValue: null, numberValue: null, dateValue: null };
    case "date": {
      const time = (value.time as string | null) ?? "00:00";
      return {
        value,
        textValue: null,
        numberValue: null,
        dateValue: new Date(`${value.date as string}T${time}:00.000Z`),
      };
    }
    case "dropdown": {
      const options = (column.settings?.options ?? []) as {
        id: string;
        text: string;
      }[];
      const ids = (value.option_ids as string[]) ?? [];
      const textValue =
        ids
          .map((id) => options.find((o) => o.id === id)?.text ?? id)
          .join(", ") || null;
      return { value, textValue, numberValue: null, dateValue: null };
    }
    case "checkbox":
      return {
        value,
        textValue: null,
        numberValue: value.checked ? 1 : 0,
        dateValue: null,
      };
    default:
      return { value, textValue: null, numberValue: null, dateValue: null };
  }
}
