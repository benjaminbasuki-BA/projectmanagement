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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { organizations, users } from "./identity.js";
import { boards } from "./structure.js";
import { items, columns } from "./work.js";

/**
 * docs/02-data-model.md §5 — Collaboration
 *
 * MVP scope only (docs/01-vision-and-scope.md §3.2):
 *  - `comments.visitor_id` omitted — share-link (guest) commenters are
 *    V1, so `author_id` is NOT NULL instead of the either/or CHECK.
 *  - `files.kind` restricted to `upload`/`paste` — `gdrive_link` needs
 *    the Google Drive integration, which is V1.
 *  - `attachments.target_type` restricted to `comment`/`column_value` —
 *    `form_submission` attachments don't apply since forms are V1.
 *  - `activity_events` has no `automation_id` column — the automations
 *    engine doesn't exist yet, so every MVP event has a real actor.
 *  - Not partitioned (doc02 specifies monthly RANGE partitioning). That's
 *    deferred until the `retention-pruner` job (doc03 §6) exists to
 *    manage partitions — partitioning without a job to maintain it would
 *    start silently rejecting writes once the initial range is exceeded.
 */

export const comments = pgTable(
  "comments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    parentCommentId: uuid("parent_comment_id").references(
      (): AnyPgColumn => comments.id,
    ),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: jsonb("body").notNull(),
    bodyText: text("body_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("comments_item_created_idx").on(t.itemId, t.createdAt),
    // GIN full-text index on body_text is added via raw SQL in the
    // hand-written migration (to_tsvector() is an expression, not a
    // plain column — see docs/03-backend-architecture.md §8).
  ],
);

export const commentReactions = pgTable(
  "comment_reactions",
  {
    // See structure.ts's workspace_members comment — added for RLS.
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("comment_reactions_comment_user_emoji_key").on(
      t.commentId,
      t.userId,
      t.emoji,
    ),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id),
    storageKey: text("storage_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256"),
    scanStatus: text("scan_status").notNull().default("pending"),
    kind: text("kind").notNull(),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("files_org_idx").on(t.orgId),
    check(
      "files_scan_status_check",
      sql`${t.scanStatus} in ('pending', 'clean', 'infected', 'skipped')`,
    ),
    check("files_kind_check", sql`${t.kind} in ('upload', 'paste')`),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id),
    targetType: text("target_type").notNull(),
    commentId: uuid("comment_id").references(() => comments.id),
    itemId: uuid("item_id").references(() => items.id),
    columnId: uuid("column_id").references(() => columns.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("attachments_item_idx").on(t.itemId),
    index("attachments_comment_idx").on(t.commentId),
    index("attachments_file_idx").on(t.fileId),
    check(
      "attachments_target_type_check",
      sql`${t.targetType} in ('comment', 'column_value')`,
    ),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
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
    itemId: uuid("item_id").references(() => items.id),
    actorId: uuid("actor_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    boardSeq: bigint("board_seq", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("activity_events_item_created_idx").on(t.itemId, t.createdAt),
    index("activity_events_board_seq_idx").on(t.boardId, t.boardSeq),
    index("activity_events_created_brin_idx").using("brin", t.createdAt),
  ],
);
