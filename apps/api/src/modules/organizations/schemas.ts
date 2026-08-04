import { z } from "zod";

/** docs/02-data-model.md §1.1: name ≤ 100 chars; slug is the URL identity. */
export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Slug must be lowercase letters, numbers, and hyphens only",
    ),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
