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
