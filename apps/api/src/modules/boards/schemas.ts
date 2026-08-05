import { z } from "zod";

/** docs/02-data-model.md §2.3. `shareable` omitted — guest access is V1. */
export const createBoardSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  type: z.enum(["main", "private"]).default("main"),
  // docs/04 §2.4: "template_id?" — one of the 6 MVP starters (templates.ts).
  templateId: z.string().optional(),
});
export type CreateBoardInput = z.infer<typeof createBoardSchema>;

export const updateBoardSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

/** docs/02-data-model.md §2.5. Palette validated loosely — doc01 doesn't
 * enumerate the 20 color keys anywhere, so this isn't CHECK-constrained
 * at the DB layer either (see structure.ts's comment on board_groups). */
export const createGroupSchema = z.object({
  title: z.string().min(1).max(80),
  color: z.string().min(1).max(40).default("gray"),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  color: z.string().min(1).max(40).optional(),
  position: z.string().min(1).optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

/** docs/02-data-model.md §3.2 — the 8 MVP column types (01 §2.2). */
export const MVP_COLUMN_TYPES = [
  "status",
  "text",
  "long_text",
  "number",
  "person",
  "date",
  "dropdown",
  "checkbox",
] as const;

export const createColumnSchema = z.object({
  title: z.string().min(1).max(60),
  type: z.enum(MVP_COLUMN_TYPES),
  description: z.string().max(500).optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
  width: z.number().int().positive().max(2000).optional(),
});
export type CreateColumnInput = z.infer<typeof createColumnSchema>;

/** Type is deliberately absent — doc04 §2.4: "Type change rejected except
 * text→long_text", which this pass doesn't special-case; see routes.ts. */
export const updateColumnSchema = z.object({
  title: z.string().min(1).max(60).optional(),
  description: z.string().max(500).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  width: z.number().int().positive().max(2000).nullable().optional(),
  position: z.string().min(1).optional(),
});
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;

/** docs/02-data-model.md §4.1 — table/kanban only (01 §2.3 MVP scope). */
export const createViewSchema = z.object({
  type: z.enum(["table", "kanban"]),
  name: z.string().min(1).max(60),
  isShared: z.boolean().default(false),
  settings: z.record(z.string(), z.unknown()).default({}),
});
export type CreateViewInput = z.infer<typeof createViewSchema>;

export const updateViewSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  position: z.string().min(1).optional(),
});
export type UpdateViewInput = z.infer<typeof updateViewSchema>;
