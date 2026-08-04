import { and, eq, isNull } from "drizzle-orm";
import {
  workspaces,
  workspaceMembers,
  boards,
  boardMembers,
} from "../../db/schema/index.js";
import type { AppDb } from "../../db/types.js";

/**
 * docs/03-backend-architecture.md §4 permission resolution, the parts
 * relevant to this task's scope (workspace/board access — not the full
 * 5-layer model, which also covers column visibility and share links,
 * neither of which exist yet):
 *
 *   workspace access: open → all org members; closed → workspace_members
 *   board access:
 *     main    → workspace access grants it implicitly
 *     private → require a board_members row
 *
 * `tx` is expected to already be inside a withTenantContext(orgId, ...)
 * scope — these helpers don't open their own transaction, so they can be
 * composed with whatever write the caller is about to do in the same one.
 */

export async function getAccessibleWorkspace(
  tx: AppDb,
  orgId: string,
  userId: string,
  workspaceId: string,
) {
  const [workspace] = await tx
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.orgId, orgId),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);

  if (!workspace) return null;

  if (workspace.type === "closed") {
    const [membership] = await tx
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!membership) return null;
  }

  return workspace;
}

export async function getAccessibleBoard(
  tx: AppDb,
  orgId: string,
  userId: string,
  boardId: string,
) {
  const [board] = await tx
    .select()
    .from(boards)
    .where(
      and(
        eq(boards.id, boardId),
        eq(boards.orgId, orgId),
        isNull(boards.deletedAt),
      ),
    )
    .limit(1);

  if (!board) return null;

  const workspace = await getAccessibleWorkspace(
    tx,
    orgId,
    userId,
    board.workspaceId,
  );
  if (!workspace) return null;

  if (board.type === "private") {
    const [membership] = await tx
      .select({ userId: boardMembers.userId })
      .from(boardMembers)
      .where(
        and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
      )
      .limit(1);
    if (!membership) return null;
  }

  return board;
}
