import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import {
  comments,
  commentReactions,
  users,
  items,
} from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { getAccessibleBoard } from "../boards/index.js";
import { recordActivity } from "../../lib/activity.js";
import { createCommentSchema, updateCommentSchema } from "./schemas.js";
import { conflict, notFound, validationError } from "../../lib/errors.js";
import type { AppDb } from "../../db/types.js";

const MAX_REACTION_LEN = 32;

/**
 * Item "Updates" thread (docs/02 §5.1, docs/04 §2.7). `body` is stored as
 * a minimal TipTap/ProseMirror-shaped doc even though the API only takes
 * plain text right now (see schemas.ts) — the frontend renders
 * `bodyText` today and can switch to rendering `body` once a real editor
 * exists, with no migration needed for comments already posted.
 */
export const commentsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/items/:itemId/comments",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { itemId } = request.params as { itemId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const result = await withTenantContext(app.db, orgId, async (tx) => {
        const item = await getAccessibleItemForComments(
          tx,
          orgId,
          userId,
          itemId,
        );
        if (!item) return null;

        const rows = await tx
          .select({
            id: comments.id,
            itemId: comments.itemId,
            parentCommentId: comments.parentCommentId,
            authorId: comments.authorId,
            authorName: users.name,
            bodyText: comments.bodyText,
            createdAt: comments.createdAt,
            editedAt: comments.editedAt,
            deletedAt: comments.deletedAt,
          })
          .from(comments)
          .innerJoin(users, eq(users.id, comments.authorId))
          .where(eq(comments.itemId, itemId))
          .orderBy(asc(comments.createdAt));

        const reactionRows = rows.length
          ? await tx
              .select()
              .from(commentReactions)
              .where(
                inArray(
                  commentReactions.commentId,
                  rows.map((r) => r.id),
                ),
              )
          : [];
        const reactionsByComment = new Map<string, typeof reactionRows>();
        for (const r of reactionRows) {
          const list = reactionsByComment.get(r.commentId) ?? [];
          list.push(r);
          reactionsByComment.set(r.commentId, list);
        }

        return rows.map((c) =>
          redactIfDeleted({
            ...c,
            reactions: (reactionsByComment.get(c.id) ?? []).map((r) => ({
              userId: r.userId,
              emoji: r.emoji,
            })),
          }),
        );
      });

      if (!result) return notFound(reply);
      return reply.send({ comments: result });
    },
  );

  app.post(
    "/items/:itemId/comments",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = createCommentSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { itemId } = request.params as { itemId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;
      const { bodyText, parentCommentId } = parsed.data;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const item = await getAccessibleItemForComments(
          tx,
          orgId,
          userId,
          itemId,
        );
        if (!item) return { kind: "not-found" as const };

        if (parentCommentId) {
          const [parent] = await tx
            .select({ parentCommentId: comments.parentCommentId })
            .from(comments)
            .where(
              and(
                eq(comments.id, parentCommentId),
                eq(comments.itemId, itemId),
                isNull(comments.deletedAt),
              ),
            )
            .limit(1);
          if (!parent) return { kind: "bad-parent" as const };
          // docs/02 §5.1: "one level; trigger rejects replies-to-replies"
          // — enforced here since no such trigger exists (comments.routes
          // is the only writer).
          if (parent.parentCommentId) {
            return { kind: "nested-reply" as const };
          }
        }

        const [created] = await tx
          .insert(comments)
          .values({
            orgId,
            itemId,
            parentCommentId: parentCommentId ?? null,
            authorId: userId,
            body: plainTextDoc(bodyText),
            bodyText,
          })
          .returning();

        await recordActivity(tx, {
          orgId,
          boardId: item.boardId,
          itemId,
          actorId: userId,
          eventType: "comment.posted",
          payload: { commentId: created.id, preview: preview(bodyText) },
        });

        return { kind: "ok" as const, comment: created };
      });

      switch (outcome.kind) {
        case "not-found":
          return notFound(reply);
        case "bad-parent":
          return conflict(
            reply,
            422,
            "invalid-parent",
            "That comment doesn't exist on this item.",
          );
        case "nested-reply":
          return conflict(
            reply,
            422,
            "nested-reply",
            "Replies can only be one level deep.",
          );
        case "ok":
          return reply.code(201).send({
            comment: {
              ...outcome.comment,
              authorName: request.authSession!.user.name,
              reactions: [],
            },
          });
      }
    },
  );

  app.patch(
    "/comments/:commentId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const parsed = updateCommentSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { commentId } = request.params as { commentId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const existing = await getOwnComment(tx, orgId, userId, commentId);
        if (!existing) return { kind: "not-found" as const };
        if (existing.deletedAt) return { kind: "deleted" as const };

        const [updated] = await tx
          .update(comments)
          .set({
            bodyText: parsed.data.bodyText,
            body: plainTextDoc(parsed.data.bodyText),
            editedAt: new Date(),
          })
          .where(eq(comments.id, commentId))
          .returning();
        return { kind: "ok" as const, comment: updated };
      });

      switch (outcome.kind) {
        case "not-found":
          return notFound(reply);
        case "deleted":
          return conflict(
            reply,
            409,
            "comment-deleted",
            "This comment has been deleted.",
          );
        case "ok":
          return reply.send({ comment: outcome.comment });
      }
    },
  );

  app.delete(
    "/comments/:commentId",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { commentId } = request.params as { commentId: string };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const deleted = await withTenantContext(app.db, orgId, async (tx) => {
        const existing = await getOwnComment(tx, orgId, userId, commentId);
        if (!existing || existing.deletedAt) return false;

        await tx
          .update(comments)
          .set({ deletedAt: new Date() })
          .where(eq(comments.id, commentId));
        return true;
      });

      if (!deleted) return notFound(reply);
      return reply.code(204).send();
    },
  );

  app.put(
    "/comments/:commentId/reactions/:emoji",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { commentId, emoji } = request.params as {
        commentId: string;
        emoji: string;
      };
      if (emoji.length === 0 || emoji.length > MAX_REACTION_LEN) {
        return conflict(reply, 422, "invalid-emoji", "Invalid reaction.");
      }
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const comment = await getAccessibleCommentForReaction(
          tx,
          orgId,
          userId,
          commentId,
        );
        if (!comment) return "not-found" as const;

        await tx
          .insert(commentReactions)
          .values({ orgId, commentId, userId, emoji })
          .onConflictDoNothing();
        return "ok" as const;
      });

      if (outcome === "not-found") return notFound(reply);
      return reply.code(204).send();
    },
  );

  app.delete(
    "/comments/:commentId/reactions/:emoji",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { commentId, emoji } = request.params as {
        commentId: string;
        emoji: string;
      };
      const { orgId } = request.tenant!;
      const userId = request.authSession!.user.id;

      const outcome = await withTenantContext(app.db, orgId, async (tx) => {
        const comment = await getAccessibleCommentForReaction(
          tx,
          orgId,
          userId,
          commentId,
        );
        if (!comment) return "not-found" as const;

        await tx
          .delete(commentReactions)
          .where(
            and(
              eq(commentReactions.commentId, commentId),
              eq(commentReactions.userId, userId),
              eq(commentReactions.emoji, emoji),
            ),
          );
        return "ok" as const;
      });

      if (outcome === "not-found") return notFound(reply);
      return reply.code(204).send();
    },
  );
};

/** ProseMirror/TipTap-shaped single-paragraph doc — see schemas.ts. */
function plainTextDoc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function preview(text: string): string {
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

/** Soft-deleted comments keep their thread position but not their content. */
function redactIfDeleted<
  T extends { deletedAt: Date | null; bodyText: string },
>(c: T): T {
  if (!c.deletedAt) return c;
  return { ...c, bodyText: "" };
}

async function getAccessibleItemForComments(
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

/** Board-accessible + not-deleted, for reactions (any board member can react). */
async function getAccessibleCommentForReaction(
  tx: AppDb,
  orgId: string,
  userId: string,
  commentId: string,
) {
  const [comment] = await tx
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)))
    .limit(1);
  if (!comment) return null;

  const item = await getAccessibleItemForComments(
    tx,
    orgId,
    userId,
    comment.itemId,
  );
  if (!item) return null;

  return comment;
}

/** Only the author can edit/delete their own comment. */
async function getOwnComment(
  tx: AppDb,
  orgId: string,
  userId: string,
  commentId: string,
) {
  const [comment] = await tx
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.authorId, userId)))
    .limit(1);
  if (!comment) return null;

  const item = await getAccessibleItemForComments(
    tx,
    orgId,
    userId,
    comment.itemId,
  );
  if (!item) return null;

  return comment;
}
