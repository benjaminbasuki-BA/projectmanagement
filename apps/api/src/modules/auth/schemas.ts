import { z } from "zod";

/**
 * docs/10-security-compliance.md §1: "argon2id... min 10 characters, no
 * composition rules (NIST 800-63B guidance)." The Pwned Passwords breach
 * check mentioned there is deferred — see password.ts.
 */
export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(256),
  name: z.string().min(1).max(100),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * `avatar_file_id` (04 §2.2) is deliberately not accepted here — no
 * files/S3 module exists yet in this codebase (CLAUDE.md's `files`
 * module boundary is unstarted), so there's nothing to point it at.
 */
export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).max(64).optional(),
  locale: z.string().min(2).max(10).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
