import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { citext, bytea } from "./_helpers.js";

/**
 * docs/02-data-model.md §1 — Identity & Tenancy
 *
 * MVP scope only (docs/01-vision-and-scope.md §3.2):
 *  - `api_tokens` (§1.5) skipped — public API access is V1.
 *  - `teams` / `team_members` (§1.6) skipped — @team is explicitly not MVP.
 */

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    slug: citext("slug").notNull(),
    logoFileId: uuid("logo_file_id"),
    settings: jsonb("settings").notNull().default({}),
    itemDisplaySeq: bigint("item_display_seq", { mode: "number" })
      .notNull()
      .default(0),
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" })
      .notNull()
      .default(0),
    // Free-for-now (01 §2.9) — no billing exists, so this can only ever
    // be 'free'. Widen this CHECK when a plan is actually introduced.
    plan: text("plan").notNull().default("free"),
    quotaOverrides: jsonb("quota_overrides"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("organizations_slug_key").on(t.slug),
    check("organizations_plan_check", sql`${t.plan} = 'free'`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    email: citext("email").notNull(),
    passwordHash: text("password_hash"),
    googleSub: text("google_sub"),
    name: text("name").notNull(),
    avatarFileId: uuid("avatar_file_id"),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en"),
    totpSecretEnc: bytea("totp_secret_enc"),
    // A secret may exist before 2FA is confirmed — only a non-null
    // enabled-at means the second factor is actually required at login.
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    uniqueIndex("users_google_sub_key").on(t.googleSub),
  ],
);

export const orgMemberships = pgTable(
  "org_memberships",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id").references(() => users.id),
    // Trimmed to MVP roles (01 §2.8 — Viewer and Guest are both tagged
    // V1 in the roles table). Widen when guest/client access ships.
    role: text("role").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id),
    inviteEmail: citext("invite_email"),
    inviteTokenHash: bytea("invite_token_hash"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("org_memberships_org_user_key").on(t.orgId, t.userId),
    index("org_memberships_user_idx").on(t.userId),
    check("org_memberships_role_check", sql`${t.role} in ('admin', 'member')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: bytea("token_hash").notNull(),
    // Not in doc02's sessions field list — added to support org-switching
    // (04 §2.2 `GET /org` implies a single "current org" resolved
    // server-side, not passed per-request; the session is the natural
    // place to pin it, matching a Slack-style workspace switcher).
    activeOrgId: uuid("active_org_id").references(() => organizations.id),
    // Simplification: Postgres `inet` has no first-class Drizzle builder;
    // stored as text rather than adding a custom type for one column.
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_active_idx")
      .on(t.userId)
      .where(sql`revoked_at is null`),
  ],
);

/**
 * Single-use password reset tokens (docs/10 §1). Only the hash is stored,
 * same discipline as `sessions.token_hash` — a database leak must not
 * yield a usable reset link.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    requestedIp: text("requested_ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_token_hash_key").on(t.tokenHash),
    index("password_reset_tokens_user_idx")
      .on(t.userId)
      .where(sql`used_at is null`),
  ],
);

/** One-time 2FA recovery codes — hashed, burned on use. */
export const userRecoveryCodes = pgTable(
  "user_recovery_codes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: bytea("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_recovery_codes_user_idx")
      .on(t.userId)
      .where(sql`used_at is null`),
  ],
);

/**
 * The gap between "password verified" and "second factor verified".
 * Deliberately not a `sessions` row: a half-authenticated user must never
 * hold anything the session middleware would accept.
 */
export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("auth_challenges_token_hash_key").on(t.tokenHash)],
);
