import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  numeric,
  integer,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { organizations, users } from "./identity.js";
import { boards, boardGroups } from "./structure.js";

/**
 * docs/02-data-model.md §3 — Work Data
 *
 * MVP scope only (docs/01-vision-and-scope.md §3.2):
 *  - `items.parent_item_id` omitted — subitems are explicitly V1;
 *    `group_id` is therefore NOT NULL (every MVP item belongs to a group).
 *  - `columns.type` restricted to the 8 MVP types; `applies_to` (subitem
 *    schema) and `visibility` (ENT column permissions) both omitted.
 *  - `tags` (§3.4), `time_entries` (§3.5), `recurrences` (§3.6) skipped —
 *    the `tags` column type, time tracking, and recurring tasks are all V1.
 */

export const items = pgTable(
  "items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => boardGroups.id),
    displaySeq: bigint("display_seq", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    position: text("position").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("items_org_display_seq_key").on(t.orgId, t.displaySeq),
    index("items_board_group_idx")
      .on(t.boardId, t.groupId, t.position)
      .where(sql`deleted_at is null`),
    index("items_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

export const columns = pgTable(
  "columns",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    title: text("title").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    settings: jsonb("settings").notNull().default({}),
    width: integer("width"),
    position: text("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("columns_board_position_idx")
      .on(t.boardId, t.position)
      .where(sql`deleted_at is null`),
    check(
      "columns_type_check",
      sql`${t.type} in ('status', 'text', 'long_text', 'number', 'person', 'date', 'dropdown', 'checkbox')`,
    ),
  ],
);

export const columnValues = pgTable(
  "column_values",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    columnId: uuid("column_id")
      .notNull()
      .references(() => columns.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    value: jsonb("value").notNull(),
    textValue: text("text_value"),
    numberValue: numeric("number_value"),
    dateValue: timestamp("date_value", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.columnId] }),
    index("column_values_board_col_num_idx").on(
      t.boardId,
      t.columnId,
      t.numberValue,
    ),
    index("column_values_board_col_date_idx").on(
      t.boardId,
      t.columnId,
      t.dateValue,
    ),
    index("column_values_org_date_idx")
      .on(t.orgId, t.dateValue)
      .where(sql`date_value is not null`),
    // ix_cv_people (partial GIN on value, jsonb_path_ops) is added via raw
    // SQL in the hand-written migration — Drizzle's builder can't express
    // the `value ? 'user_ids'` operator reliably.
  ],
);

export const itemSubscribers = pgTable(
  "item_subscribers",
  {
    // See structure.ts's workspace_members comment — added for RLS.
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("item_subscribers_item_user_key").on(t.itemId, t.userId),
    index("item_subscribers_user_idx").on(t.userId),
    check(
      "item_subscribers_reason_check",
      sql`${t.reason} in ('assignee', 'mentioned', 'creator', 'manual')`,
    ),
  ],
);
