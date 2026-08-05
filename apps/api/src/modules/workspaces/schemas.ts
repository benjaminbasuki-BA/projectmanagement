import { z } from "zod";

/** docs/02-data-model.md §2.1: name ≤ 60 chars, type open|closed. */
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(["open", "closed"]).default("open"),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(60),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
