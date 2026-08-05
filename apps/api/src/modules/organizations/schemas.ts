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

/** Logo upload isn't included — no files/S3 module exists yet (avatar_file_id
 * / logo_file_id are reserved columns; see docs/02 §1). */
export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
});

export const updateMemberSchema = z.object({
  role: z.enum(["admin", "member"]),
});
