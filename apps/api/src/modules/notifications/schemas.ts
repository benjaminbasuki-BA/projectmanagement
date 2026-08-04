import { z } from "zod";

export const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;
