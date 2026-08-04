import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { organizations, users } from "./identity.js";
import { boards } from "./structure.js";
import { items } from "./work.js";

/**
 * docs/02-data-model.md §6.3, §6.6 — Platform / AI
 *
 * MVP scope only (docs/01-vision-and-scope.md §3.2, §2.10):
 *  - `automations` / `automation_runs` (§6.1-6.2) skipped — the
 *    automations engine is V1.
 *  - `webhooks` / `webhook_deliveries` (§6.4) skipped — public API and
 *    webhooks are V1.
 *  - `integration_connections` (§6.5) skipped — integrations beyond CSV
 *    import/export are V1; CSV is a synchronous flow, no table needed.
 *  - `outbox` IS included: it's generic event-bus infrastructure needed
 *    by real-time updates and notification fanout, both MVP — it has no
 *    dependency on the V1-only consumers (automation-exec, webhook
 *    delivery) that will read from it later.
 *  - `ai_interactions.feature` restricted to `nl_search`/
 *    `summarize_thread` — the only two AI features that ship in MVP
 *    (01 §2.10). `ai_drafts` (§6.6) skipped — it only backs
 *    content-generating AI features (task generation, etc.), all V1+.
 */

export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    boardId: uuid("board_id").references(() => boards.id),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("outbox_unpublished_idx")
      .on(t.createdAt)
      .where(sql`published_at is null`),
  ],
);

export const aiInteractions = pgTable(
  "ai_interactions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    feature: text("feature").notNull(),
    boardId: uuid("board_id").references(() => boards.id),
    itemId: uuid("item_id").references(() => items.id),
    inputSummary: text("input_summary"),
    output: jsonb("output").notNull().default({}),
    outcome: text("outcome").notNull(),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_interactions_org_feature_created_idx").on(
      t.orgId,
      t.feature,
      t.createdAt,
    ),
    index("ai_interactions_user_created_idx").on(t.userId, t.createdAt),
    check(
      "ai_interactions_feature_check",
      sql`${t.feature} in ('nl_search', 'summarize_thread')`,
    ),
    check(
      "ai_interactions_outcome_check",
      sql`${t.outcome} in ('shown', 'accepted', 'edited_then_accepted', 'dismissed')`,
    ),
  ],
);
