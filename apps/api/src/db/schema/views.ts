import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { organizations, users } from "./identity.js";
import { boards } from "./structure.js";

/**
 * docs/02-data-model.md §4 — Views, Sharing & Intake
 *
 * MVP scope only (docs/01-vision-and-scope.md §3.2):
 *  - `type` restricted to `table`/`kanban` — Timeline/Gantt, Calendar,
 *    and form view types are all V1.
 *  - `public_slug` omitted — it exists solely for the `form` view type.
 *  - `share_links` (§4.2), `share_link_visitors` (§4.3), and
 *    `form_submissions` (§4.4) all skipped — guest/client share links
 *    and forms are both V1.
 */

export const views = pgTable(
  "views",
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
    type: text("type").notNull(),
    name: text("name").notNull(),
    position: text("position").notNull(),
    isShared: boolean("is_shared").notNull().default(false),
    ownerId: uuid("owner_id").references(() => users.id),
    settings: jsonb("settings").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("views_board_idx").on(t.boardId),
    check("views_type_check", sql`${t.type} in ('table', 'kanban')`),
    check(
      "views_personal_owner_check",
      sql`${t.isShared} = true or ${t.ownerId} is not null`,
    ),
  ],
);
