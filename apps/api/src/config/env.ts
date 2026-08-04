import "dotenv/config";
import { z } from "zod";

/**
 * Validated environment config (CLAUDE.md "environment variable handling").
 * Add new vars here as features need them — never read process.env
 * directly elsewhere in the app.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  // Migration-time connection — runs as the table-owning superuser
  // (docker-compose's POSTGRES_USER). drizzle.config.ts uses this.
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required — see .env.example"),
  // Runtime connection — runs as the non-superuser `app_user` role
  // created in drizzle/0002_tenancy_and_rls.sql, so RLS policies
  // (drizzle/0004_rls_policies.sql) are actually enforced against it
  // rather than silently bypassed (Postgres exempts table owners/
  // superusers from RLS by default; see 03 §4).
  APP_DATABASE_URL: z
    .string()
    .min(1, "APP_DATABASE_URL is required — see .env.example"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Session cookie signing/handling (03 §3): opaque 256-bit token, hash
  // stored server-side. Recovery codes/CSRF secret would live here too
  // once those ship.
  SESSION_COOKIE_NAME: z.string().default("trellis_session"),

  // Public origin of the web app — used to build password-reset links and
  // the OAuth redirect target. Not the API's own origin.
  APP_BASE_URL: z.string().default("http://localhost:5173"),

  // Google OAuth (01 §2.1 MVP auth). All three must be present for the
  // provider to be advertised by GET /auth/config; when unset the web app
  // simply doesn't render the button — no dead ends (doc 11 §K).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z
    .string()
    .default("http://localhost:3001/v1/auth/oauth/google/callback"),

  // Postmark. Without a token the mailer falls back to a console transport
  // so password reset is fully testable in local dev.
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  MAIL_FROM: z.string().default("Trellis <no-reply@trellis.local>"),

  // Encrypts `users.totp_secret_enc` at rest (AES-256-GCM), so a database
  // leak alone cannot mint valid TOTP codes. 32 bytes, base64. A dev
  // default is generated below when unset — never rely on that in prod.
  TOTP_ENCRYPTION_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

/** Google sign-in is only offered when fully configured. */
export const googleOAuthConfigured = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);

if (env.NODE_ENV === "production" && !env.TOTP_ENCRYPTION_KEY) {
  console.error(
    "❌ TOTP_ENCRYPTION_KEY is required in production — 2FA secrets would " +
      "otherwise be encrypted with an ephemeral key and become unreadable " +
      "after a restart, locking out every user with 2FA enabled.",
  );
  process.exit(1);
}
