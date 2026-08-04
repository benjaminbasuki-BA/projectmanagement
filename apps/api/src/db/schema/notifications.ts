import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { organizations, users } from "./identity.js";
import { boards } from "./structure.js";
import { items } from "./work.js";
import { comments } from "./collaboration.js";

/**
 * docs/02-data-model.md §5.4-5.5 — Notifications
 *
 * MVP scope only (docs/01-vision-and-scope.md §3.2):
 *  - `notifications.event_type` excludes `automation_failed`,
 *    `form_submission`, and `guest_accepted_invite` — each depends on a
 *    V1-only feature (automations, forms, guest access respectively).
 *  - `notification_preferences.dnd` omitted — doc01 §2.6 explicitly
 *    tags "account-level Do Not Disturb schedule" as V1; per-board mute
 *    (`board_mutes`) has no such tag and is MVP.
 */

export const notifications = pgTable(
  "notifications",
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
    eventType: text("event_type").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    itemId: uuid("item_id").references(() => items.id),
    boardId: uuid("board_id").references(() => boards.id),
    commentId: uuid("comment_id").references(() => comments.id),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_user_unread_idx")
      .on(t.userId)
      .where(sql`read_at is null`),
    check(
      "notifications_event_type_check",
      sql`${t.eventType} in ('assigned', 'mentioned', 'reply', 'reaction', 'status_changed', 'due_soon', 'item_created')`,
    ),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    emailCadence: text("email_cadence").notNull().default("instant"),
    channelOverrides: jsonb("channel_overrides").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "notification_preferences_email_cadence_check",
      sql`${t.emailCadence} in ('instant', 'hourly', 'daily', 'off')`,
    ),
  ],
);

export const boardMutes = pgTable(
  "board_mutes",
  {
    // See structure.ts's workspace_members comment — added for RLS.
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("board_mutes_user_board_key").on(t.userId, t.boardId)],
);
