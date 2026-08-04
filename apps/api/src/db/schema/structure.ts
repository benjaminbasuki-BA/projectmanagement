import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  boolean,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { organizations, users } from "./identity.js";

/**
 * docs/02-data-model.md §2 — Structure
 *
 * MVP scope only (docs/01-vision-and-scope.md §3.2):
 *  - `folders` (§2.2) skipped — "flat board list is fine for MVP" (01 §2.1).
 *    `boards` therefore has no `folder_id` column yet.
 *  - `boards.type` trimmed to `main`/`private` — `shareable` boards exist
 *    to support guest/client share links, which are V1.
 *  - `board_members.permission_level` omitted — doc02 tags it "(V1)"
 *    explicitly; MVP access is binary (member of a private board, or not).
 */

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    type: text("type").notNull(),
    icon: jsonb("icon").notNull().default({}),
    description: text("description"),
    position: text("position").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // "timestamps" shorthand in doc02 §2.1 = created_at + updated_at.
    // Trigger defined in the hand-written migration (see drizzle/0001).
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("workspaces_org_idx").on(t.orgId),
    check("workspaces_type_check", sql`${t.type} in ('open', 'closed')`),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    // Not in doc02's literal field list for this table, but required by
    // §0's own convention ("org_id on every tenant-owned table, even
    // when derivable via joins... never skip this on a new table") —
    // needed here specifically so RLS can scope this table directly.
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    isOwner: boolean("is_owner").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_members_workspace_user_key").on(
      t.workspaceId,
      t.userId,
    ),
  ],
);

export const boards = pgTable(
  "boards",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull(),
    itemTerminology: text("item_terminology").notNull().default("item"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    settings: jsonb("settings").notNull().default({}),
    itemCount: integer("item_count").notNull().default(0),
    permissionVersion: integer("permission_version").notNull().default(0),
    eventSeq: bigint("event_seq", { mode: "number" }).notNull().default(0),
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
    index("boards_workspace_active_idx")
      .on(t.workspaceId)
      .where(sql`deleted_at is null`),
    index("boards_org_idx").on(t.orgId),
    check("boards_type_check", sql`${t.type} in ('main', 'private')`),
  ],
);

export const boardMembers = pgTable(
  "board_members",
  {
    // See workspace_members — added for RLS, not in doc02's literal list.
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    isOwner: boolean("is_owner").notNull().default(false),
    isSubscriber: boolean("is_subscriber").notNull().default(true),
    addedBy: uuid("added_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("board_members_board_user_key").on(t.boardId, t.userId)],
);

export const boardGroups = pgTable(
  "board_groups",
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
    color: text("color").notNull(),
    position: text("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("board_groups_board_position_idx")
      .on(t.boardId, t.position)
      .where(sql`archived_at is null`),
  ],
);
