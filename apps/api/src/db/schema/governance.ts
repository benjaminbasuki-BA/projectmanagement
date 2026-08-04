import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { organizations, users } from "./identity.js";

/**
 * docs/02-data-model.md §8 — Governance
 *
 * `audit_logs` is written from MVP even though its ENT-gated *viewing*
 * UI isn't built yet (CLAUDE.md, "Constraint" section — "audit logging
 * is active from MVP... keep writing audit_logs events... don't defer
 * it"). The full 24-event catalog (01 §2.8) is kept as-is rather than
 * trimmed to MVP-reachable events: audit_logs is explicitly meant to be
 * complete from day one, and several events (e.g. `billing.plan_changed`)
 * are simply unreachable today, not incorrect to allow.
 *
 * Not partitioned yet — same reasoning as `activity_events`
 * (collaboration.ts): partitioning is deferred until the
 * `retention-pruner` job exists to manage partitions.
 */

const AUDIT_EVENTS = [
  "user.login",
  "user.login_failed",
  "user.logout",
  "user.invited",
  "user.deactivated",
  "user.role_changed",
  "auth.2fa_enabled",
  "auth.sso_config_changed",
  "board.created",
  "board.deleted",
  "board.permission_changed",
  "board.share_link_created",
  "board.share_link_revoked",
  "guest.invited",
  "guest.removed",
  "item.bulk_deleted",
  "export.requested",
  "file.downloaded",
  "api_token.created",
  "api_token.revoked",
  "webhook.created",
  "billing.plan_changed",
  "workspace.created",
  "workspace.deleted",
] as const;

// A CHECK constraint is static DDL, not a parameterized query — sql`${e}`
// would bind each value as a $1, $2… query parameter (correct for normal
// queries, but meaningless in a migration file with no bind context), so
// this builds a literal SQL IN-list via sql.raw() instead.
const auditEventList = sql.raw(AUDIT_EVENTS.map((e) => `'${e}'`).join(", "));

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    actorId: uuid("actor_id").references(() => users.id),
    // Simplification: Postgres `inet` has no first-class Drizzle builder;
    // stored as text rather than adding a custom type for one column.
    actorIp: text("actor_ip"),
    event: text("event").notNull(),
    targetType: text("target_type"),
    // Polymorphic — deliberately no FK (target_type determines the table).
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_logs_org_created_idx").on(t.orgId, t.createdAt),
    index("audit_logs_org_event_created_idx").on(t.orgId, t.event, t.createdAt),
    check("audit_logs_event_check", sql`${t.event} in (${auditEventList})`),
  ],
);
