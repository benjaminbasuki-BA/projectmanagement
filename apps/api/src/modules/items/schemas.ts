import { z } from "zod";

/** docs/02-data-model.md §3.1. `parent_item_id` intentionally absent —
 * subitems are V1 (see work.ts's schema header comment). */
export const createItemSchema = z.object({
  name: z.string().min(1).max(255),
  groupId: z.string().uuid(),
  columnValues: z.record(z.string().uuid(), z.unknown()).optional(),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  position: z.string().min(1).optional(),
});
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

/** docs/04-api-design.md §3.3 — the hot path: `{columnId: value}`. */
export const updateColumnValuesSchema = z.record(
  z.string().uuid(),
  z.unknown(),
);
export type UpdateColumnValuesInput = z.infer<typeof updateColumnValuesSchema>;

/**
 * docs/02-data-model.md §5.1: `comments.body` is a TipTap/ProseMirror doc
 * in the full spec. The web app doesn't have a rich-text editor wired up
 * yet (that's its own follow-up), so the API takes plain text and wraps
 * it into a minimal valid doc shape server-side (comments.routes.ts) —
 * forward-compatible with a real editor later without a data migration.
 */
/**
 * `mentionedUserIds` is explicit, not parsed out of `@Name` in the text —
 * with a plain-text composer (no rich-text mention nodes yet), matching
 * free text against names is ambiguous the moment two people share a
 * first name. The composer's autocomplete already knows exactly which
 * user was picked; the server just validates each id is someone the
 * author could legitimately mention (comments.routes.ts).
 */
export const createCommentSchema = z.object({
  bodyText: z.string().trim().min(1).max(10_000),
  parentCommentId: z.string().uuid().optional(),
  mentionedUserIds: z.array(z.string().uuid()).max(20).optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  bodyText: z.string().trim().min(1).max(10_000),
});
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
