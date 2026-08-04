import { and, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { boards, boardMembers } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleWorkspace, getAccessibleBoard } from "./access.js";
import { createBoardSchema, updateBoardSchema } from "./schemas.js";
import { notFound, validationError } from "../../lib/errors.js";
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
      const { name, description, type } = parsed.data;

      const board = await withTenantContext(app.db, orgId, async (tx) => {
        const workspace = await getAccessibleWorkspace(
          tx,
          orgId,
          userId,
          workspaceId,
        );
        if (!workspace) return null;

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

        return created;
      });

      if (!board) return notFound(reply);
      return reply.code(201).send({ board });
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
