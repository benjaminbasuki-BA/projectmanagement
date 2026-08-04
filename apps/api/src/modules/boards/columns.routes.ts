import { and, count, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { columns } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleBoard } from "./access.js";
import { createColumnSchema, updateColumnSchema } from "./schemas.js";
import { conflict, notFound, validationError } from "../../lib/errors.js";

/** docs/02-data-model.md §3.2, docs/04-api-design.md §2.4. */
export const columnsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/boards/:boardId/columns",
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
          .from(columns)
          .where(and(eq(columns.boardId, boardId), isNull(columns.deletedAt)));
      });

      if (!result) return notFound(reply);
      return reply.send({ columns: result });
    },
  );

  app.post(
    "/boards/:boardId/columns",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = createColumnSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { boardId } = request.params as { boardId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const board = await getAccessibleBoard(tx, orgId, userId, boardId);
        if (!board) return { kind: "not-found" as const };

        const [{ value }] = await tx
          .select({ value: count(columns.id) })
          .from(columns)
          .where(and(eq(columns.boardId, boardId), isNull(columns.deletedAt)));
        // docs/04 §2.4: "50-column limit ⇒ 422 column_limit_reached"
        if (value >= 50) return { kind: "limit" as const };

        const [created] = await tx
          .insert(columns)
          .values({
            orgId,
            boardId,
            title: parsed.data.title,
            type: parsed.data.type,
            description: parsed.data.description,
            settings: parsed.data.settings,
            width: parsed.data.width,
            position: String(Date.now()),
          })
          .returning();
        return { kind: "ok" as const, column: created };
      });

      if (outcome.kind === "not-found") return notFound(reply);
      if (outcome.kind === "limit") {
        return conflict(
          reply,
          422,
          "column_limit_reached",
          "This board already has the maximum of 50 columns.",
        );
      }
      return reply.code(201).send({ column: outcome.column });
    },
  );

  app.patch(
    "/columns/:columnId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = updateColumnSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { columnId } = request.params as { columnId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const column = await withTenantContext(app.db, orgId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(columns)
          .where(eq(columns.id, columnId))
          .limit(1);
        if (!existing) return null;
        const board = await getAccessibleBoard(
          tx,
          orgId,
          userId,
          existing.boardId,
        );
        if (!board) return null;

        // `type` is deliberately not in updateColumnSchema at all —
        // docs/04 §2.4: "Type change rejected except text→long_text",
        // and even that one exception isn't implemented in this pass
        // (it's a settings-only reinterpretation, not a plain column
        // update); changing a column's type requires creating a new one.
        const [updated] = await tx
          .update(columns)
          .set(parsed.data)
          .where(eq(columns.id, columnId))
          .returning();
        return updated;
      });

      if (!column) return notFound(reply);
      return reply.send({ column });
    },
  );

  app.delete(
    "/columns/:columnId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { columnId } = request.params as { columnId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const column = await withTenantContext(app.db, orgId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(columns)
          .where(eq(columns.id, columnId))
          .limit(1);
        if (!existing) return null;
        const board = await getAccessibleBoard(
          tx,
          orgId,
          userId,
          existing.boardId,
        );
        if (!board) return null;

        // Soft delete — "values retained 30 days" (docs/02 §3.2). The
        // 30-day purge job is out of scope here (no background-job
        // infra exists yet).
        const [updated] = await tx
          .update(columns)
          .set({ deletedAt: new Date() })
          .where(eq(columns.id, columnId))
          .returning({ id: columns.id });
        return updated;
      });

      if (!column) return notFound(reply);
      return reply.code(204).send();
    },
  );
};
