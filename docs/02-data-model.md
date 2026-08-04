# 02 — Data Model

| | |
|---|---|
| **Product** | Trellis |
| **Document** | Stage 2 of 4 — Database Schema |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-10 |
| **Source of truth for scope/limits** | [01-vision-and-scope.md](01-vision-and-scope.md) |
| **Database** | PostgreSQL 16 (single primary; see 03 for infra) |

---

## 0. Conventions

- **IDs:** UUIDv7 (`uuid` type) everywhere — time-ordered for index locality, no coordination, safe to expose in URLs. Human-facing item numbers are a separate per-organization sequence (`items.display_seq`, rendered `TRL-1042`). *Correction to Stage 1: "globally unique item id" is implemented as unique-per-organization; the UUID is the globally unique key.*
- **Tenancy:** `org_id uuid NOT NULL` on every tenant-owned table, even when derivable via joins — it enables Row-Level Security, simple partition keys, and cheap tenant-scoped indexes. "Organization" = the "Account" level in Stage 1's hierarchy.
- **Naming:** snake_case; plural table names; FKs named `<entity>_id`; enums stored as `text` + `CHECK` constraint (Postgres native enums make `ALTER` painful).
- **Timestamps:** `timestamptz`, UTC. Every table has `created_at DEFAULT now()`; mutable tables add `updated_at` (maintained by trigger).
- **Deletion:** user-facing content uses soft delete (`archived_at`, `deleted_at`) with 30-day recovery (Stage 1); a nightly purge job hard-deletes past the window. Governance/log tables are append-only.
- **Ordering:** user-sortable rows (`groups`, `items`, `columns`, `views`, shared view tabs) use a lexicographic rank `position text` (LexoRank-style, e.g. `"a0m"`) — reordering writes one row, no shuffling. A rebalance job rewrites ranks when they grow past 60 chars.
- **Migrations:** Drizzle Kit, one linear `migrations/` directory, applied by CI before deploy. RLS policies live in migrations too.

### Entity-relationship overview

```
organizations ─┬─ org_memberships ─── users ─── sessions / api_tokens
               ├─ teams ── team_members
               ├─ workspaces ─┬─ workspace_members
               │              ├─ folders (≤3 deep)
               │              ├─ dashboards ── widgets
               │              └─ boards ─┬─ board_members
               │                         ├─ board_groups
               │                         ├─ columns ──────────────┐
               │                         ├─ items (+ parent_item_id = subitems)
               │                         │    ├─ column_values ◄──┘
               │                         │    ├─ comments ── comment_reactions
               │                         │    ├─ item_subscribers
               │                         │    ├─ time_entries
               │                         │    └─ attachments ── files
               │                         ├─ views (incl. forms) ── share_links
               │                         ├─ automations ── automation_runs
               │                         ├─ webhooks ── webhook_deliveries
               │                         └─ activity_events
               ├─ integration_connections
               ├─ notifications / notification_preferences
               ├─ audit_logs
               ├─ outbox  (transactional event bus feed)
               └─ subscriptions ── invoices   [DORMANT — not created; see §9]
```

---

## 1. Identity & Tenancy

### 1.1 `organizations`

The top-level tenant ("Account" in Stage 1).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | ≤ 100 chars |
| `slug` | citext UNIQUE | URL identity, e.g. `northpeak-agency` |
| `logo_file_id` | uuid FK → files, null | |
| `settings` | jsonb | defaults: board permission default, notification defaults, domain_capture (ENT) |
| `item_display_seq` | bigint DEFAULT 0 | counter behind `TRL-####`; bumped via `UPDATE … RETURNING` |
| `storage_used_bytes` | bigint DEFAULT 0 | maintained by trigger on `files`; checked against 20 GB fair-use |
| `plan` | text DEFAULT `'free'` | only `'free'` exists today; read by the `entitlements` module |
| `quota_overrides` | jsonb null | support-granted fair-use raises, e.g. `{"storage_gb": 50}` |
| `created_at` / `deleted_at` | timestamptz | |

**Indexes:** `UNIQUE(slug)`.
**Scalability:** tiny table (1 row per customer). The `item_display_seq` counter is a hot row under bulk import — batch-reserve ranges (grab 500 at once) in the import job.

### 1.2 `users`

Global identities; one user can belong to many organizations (an agency's client contact is one `user` with two memberships).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | citext UNIQUE | |
| `password_hash` | text null | argon2id; null for OAuth-only users |
| `google_sub` | text UNIQUE null | Google OIDC subject |
| `name` | text | ≤ 100 |
| `avatar_file_id` | uuid null | |
| `timezone` | text DEFAULT `'UTC'` | IANA name; drives digests & due-date alerts |
| `locale` | text DEFAULT `'en'` | |
| `totp_secret_enc` | bytea null | AES-256-GCM (KMS envelope); set ⇒ 2FA on |
| `email_verified_at` | timestamptz null | |
| `last_active_at` | timestamptz | throttled write (max 1/5 min) |
| `created_at` / `deleted_at` | | |

**Indexes:** `UNIQUE(email)`, `UNIQUE(google_sub)`.

### 1.3 `org_memberships`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `org_id` / `user_id` | uuid FK | `UNIQUE(org_id, user_id)` |
| `role` | text | `admin · member · viewer · guest` (Stage 1 §2.8) |
| `invited_by` | uuid null | |
| `invite_email` / `invite_token_hash` / `invite_expires_at` | | pending invites live here with `user_id` null until accepted |
| `joined_at` / `deactivated_at` | timestamptz | deactivation keeps the row (history, re-activation) |

**Indexes:** `UNIQUE(org_id, user_id)`, `ix(user_id)` (login → org list), partial `ix(org_id) WHERE role = 'guest'` (guest-audit page).

### 1.4 `sessions`

Postgres is the source of truth (powers "sign out everywhere"); Redis caches by token hash.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `token_hash` | bytea UNIQUE | SHA-256 of opaque cookie token |
| `ip` | inet · `user_agent` text | shown in the admin session list |
| `created_at` / `last_seen_at` / `expires_at` / `revoked_at` | | 30-day rolling expiry |

**Indexes:** `UNIQUE(token_hash)`, `ix(user_id) WHERE revoked_at IS NULL`.

### 1.5 `api_tokens`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK · `org_id` · `user_id` | tokens act **as a user within one org** |
| `name` | text | e.g. "Zapier production" |
| `token_hash` | bytea UNIQUE | secret shown once: `trl_pat_<32 bytes b64url>` |
| `scopes` | text[] | subset of `read · write · admin` (Stage 1) |
| `last_used_at` / `expires_at` / `revoked_at` | | `last_used_at` throttled to 1 write/min |

### 1.6 `teams` / `team_members`

Org-level named groups for `@team` mentions and future permissions. `teams(id, org_id, name ≤50, color)`, `UNIQUE(org_id, name)`, max 100/org (app-enforced). `team_members(team_id, user_id)` with `UNIQUE(team_id, user_id)`.

---

## 2. Structure

### 2.1 `workspaces`

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` | | limit 20/org via `entitlements` |
| `name` | text ≤ 60 | |
| `type` | text | `open · closed` |
| `icon` | jsonb | `{"emoji":"🎯"}` or `{"monogram":"CW","color":"#0073EA"}` |
| `description` | text ≤ 500 | |
| `position` | text | sidebar order |
| `created_by` / timestamps / `deleted_at` | | |

**Membership:** `workspace_members(workspace_id, user_id, is_owner bool)`, `UNIQUE(workspace_id, user_id)`. For `open` workspaces membership is implicit (all org members/viewers); rows exist only for owners and explicit joins. `closed` workspaces require a row. 1–10 owners enforced in app.

### 2.2 `folders`

`folders(id, org_id, workspace_id, parent_folder_id null, name ≤60, position, created_at)`. Depth ≤ 3 enforced by trigger walking `parent_folder_id`. No permissions of their own (Stage 1). **Index:** `ix(workspace_id, parent_folder_id)`.

### 2.3 `boards`

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `workspace_id` · `folder_id` null | | |
| `name` | text ≤ 120 | |
| `description` | text | |
| `type` | text | `main · private · shareable` |
| `item_terminology` | text DEFAULT `'item'` | "task", "deliverable"… |
| `owner_id` | uuid FK users | |
| `settings` | jsonb | subitem rollup mode, default permission level, status-transition rules (ENT), dependency auto-shift mode |
| `item_count` | int DEFAULT 0 | denormalized; trigger-maintained; enforces the 20,000 cap cheaply |
| `permission_version` | int DEFAULT 0 | bumped on any permission change → invalidates authz cache (doc 03) |
| `event_seq` | bigint DEFAULT 0 | per-board real-time sequence number (doc 03 §5) |
| timestamps · `archived_at` · `deleted_at` | | |

**Indexes:** `ix(workspace_id) WHERE deleted_at IS NULL`, `ix(org_id)`.
**Scalability:** ~100 boards/workspace soft cap. `item_count` and `event_seq` make boards a moderately hot row; both updates are `SET x = x + 1` without reads — acceptable to ~50 writes/s/board, far above real usage.

### 2.4 `board_members`

| Field | Type | Notes |
|---|---|---|
| `board_id` / `user_id` | | `UNIQUE(board_id, user_id)` |
| `permission_level` | text | `edit_everything · edit_content · edit_own · view_only` (V1) |
| `is_owner` / `is_subscriber` | bool | subscribers get board-level notifications |
| `added_by` / `created_at` | | |

Rows are required for `private`/`shareable` boards and for guests; `main` boards grant workspace members the board's default level implicitly.

### 2.5 `board_groups`

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `board_id` | | max 200/board (app) |
| `title` | text ≤ 80 | |
| `color` | text | one of the 20 palette keys, e.g. `"orange"` |
| `position` | text | rank |
| `archived_at` | | |

**Index:** `ix(board_id, position) WHERE archived_at IS NULL`. Per-user collapsed state is client/user-preference data, **not** stored here.

---

## 3. Work Data

### 3.1 `items` (also stores subitems)

**Design decision:** subitems are rows in `items` with `parent_item_id` set — not a separate table. Rationale: moves, activity, comments, search, and column_values machinery work identically; the one-level-only rule is a `CHECK`-by-trigger, not a schema fork. The separate "subitem schema" from Stage 1 is handled on `columns.applies_to`.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `org_id` · `board_id` · `group_id` | uuid | `group_id` **null for subitems** (they live under a parent, not a group) |
| `parent_item_id` | uuid FK items, null | set ⇒ subitem; trigger rejects grandchildren & > 100 children |
| `display_seq` | bigint | per-org sequence → rendered `TRL-1042`; `UNIQUE(org_id, display_seq)` |
| `name` | text ≤ 255 | |
| `position` | text | rank within group (or within parent for subitems) |
| `created_by` | uuid | |
| timestamps · `archived_at` · `deleted_at` | | |

**Indexes:**
- `ix_items_board_group ON (board_id, group_id, position) WHERE deleted_at IS NULL AND parent_item_id IS NULL` — the board-render query.
- `ix_items_parent ON (parent_item_id, position) WHERE deleted_at IS NULL` — subitem fetch.
- `UNIQUE(org_id, display_seq)`.
- `ix_items_org_created ON (org_id, created_at)` — exports, retention.

**Scalability:** 20k items/board hard cap keeps single-board queries bounded. At 100k orgs × ~2k items avg = 200M rows this stays a plain table; partition by `HASH(org_id)` only past ~500M rows. Name search goes through the search service (doc 03 §8), not `LIKE`.

### 3.2 `columns`

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `board_id` | | max 50/board (app + `entitlements`) |
| `title` | text ≤ 60 | |
| `type` | text | one of the 24 keys from Stage 1 §2.2 (`status`, `text`, `number`, `person`, `date`, `timeline`, …) |
| `applies_to` | text DEFAULT `'item'` | `item · subitem` — implements the separate subitem schema |
| `description` | text null | tooltip |
| `settings` | jsonb | per-type config, see below |
| `width` | int · `position` | text rank | |
| `visibility` | jsonb null | ENT column-level permissions: `{"hidden_from_roles":["guest"],"hidden_from_users":[…]}` |
| `created_at` / `deleted_at` | | column delete = soft; values retained 30 days |

**`settings` examples:**
- `status`: `{"labels":[{"id":"lbl_ns","text":"Not started","color":"#C4C4C4","is_done":false},{"id":"lbl_done","text":"Done","color":"#00C875","is_done":true}]}` — label ids are stable; renames don't touch values. Max 20 labels.
- `number`: `{"format":"currency","currency":"EUR","decimals":2,"aggregate":"sum"}`
- `dropdown`: `{"options":[{"id":"opt_1","text":"Design"}],"multi":false}` — max 100 options.

**Index:** `ix(board_id, position) WHERE deleted_at IS NULL`. Type changes are disallowed (Stage 1) except `text → long_text` (settings-only change).

### 3.3 `column_values`

The biggest table in the system. **Sparse:** a row exists only when a cell is non-empty.

| Field | Type | Notes |
|---|---|---|
| `item_id` / `column_id` | uuid | **composite PK** `(item_id, column_id)` |
| `org_id` · `board_id` | uuid | denormalized for RLS + board-scoped queries |
| `value` | jsonb | canonical shape per type — see Appendix A |
| `text_value` | text | trigger-extracted flat text (search feed, text sort) |
| `number_value` | numeric | extracted from `number`, `rating`, `time_tracking` totals |
| `date_value` | timestamptz | extracted from `date` / `timeline.start` — powers date-trigger scans & calendar |
| `updated_by` / `updated_at` | | |

**Indexes:**
- PK `(item_id, column_id)` — item hydration.
- `ix_cv_board_col_num ON (board_id, column_id, number_value)` and `…_date ON (board_id, column_id, date_value)` — sort/filter/aggregate per column.
- Partial GIN `ix_cv_people ON (value jsonb_path_ops) WHERE …` — "assigned to me" across boards uses a targeted GIN on person/tags columns only (kept small via `WHERE value ? 'user_ids' OR value ? 'tag_ids'`).
- `ix_cv_org_date ON (org_id, date_value) WHERE date_value IS NOT NULL` — the automation date-trigger scanner ("date arrives / N days before").

**Scalability notes:**
- Expected volume: ~10 non-empty cells/item ⇒ 10× `items` row count; at 200M items ⇒ 2B rows. Plan: `PARTITION BY HASH(board_id)` (16 partitions) from day one is **not** needed; add at ~500M rows — the composite-PK access pattern partitions cleanly later because every query carries `board_id` or `item_id`.
- All writes are single-row upserts (`INSERT … ON CONFLICT (item_id, column_id) DO UPDATE`); batch edits (≤500 items) use one multi-row statement.
- `formula` and `mirror` columns store **nothing** here — computed at read (doc 03); this table stays pure user data.

### 3.4 `tags`

Workspace-shared pool (Stage 1): `tags(id, org_id, workspace_id, name citext ≤ 40, color)`, `UNIQUE(workspace_id, name)`. Values reference `tag_ids` in `column_values.value`.

### 3.5 `time_entries`

Source of truth for the `time_tracking` column (the column_value stores only the denormalized total).

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `item_id` · `column_id` · `user_id` | | |
| `started_at` / `ended_at` | timestamptz | `ended_at IS NULL` ⇒ running timer |
| `duration_seconds` | int | derived, editable; ≤ 86,400 |
| `note` | text ≤ 255 · `billable` bool · `source` | `timer · manual` |

**Indexes:** `ix(item_id)`, `ix(org_id, user_id, started_at)` (time reports), and the elegant one: `UNIQUE(user_id) WHERE ended_at IS NULL` — **one running timer per user account-wide, enforced by the database**.

### 3.6 `recurrences`

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `board_id` · `template_item_id` | | max 100 active/board |
| `frequency` | text | `daily · weekly · monthly · yearly` |
| `interval` | smallint 1–99 · `by_weekday` smallint[] · `by_monthday` smallint (−1 = last) | Stage 1 §2.5 fields |
| `ends_mode` | text | `never · after_n · on_date` (+ `ends_after_n`, `ends_on_date`) |
| `create_ahead_days` | smallint 0–30 | |
| `next_run_at` | timestamptz | precomputed next materialization instant |
| `occurrences_created` | int · `paused_at` | paused when board archived |

**Index:** `ix(next_run_at) WHERE paused_at IS NULL` — the scheduler's only scan.

### 3.7 `item_subscribers`

`(item_id, user_id, reason text: assignee · mentioned · creator · manual, created_at)`, `UNIQUE(item_id, user_id)`. Drives notification fan-out. **Index:** `ix(user_id)` for "unfollow all" and My Work signals.

---

## 4. Views, Sharing & Intake

### 4.1 `views`

Forms are a view type — they share naming, positioning, and share-link machinery.

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `board_id` | | max 50/board |
| `type` | text | `table · kanban · timeline · calendar · form` |
| `name` | text ≤ 60 · `position` | shared-view tab order; leftmost = default landing (Stage 1) |
| `is_shared` | bool | false ⇒ personal (`owner_id` required) |
| `owner_id` | uuid null | |
| `settings` | jsonb | filters, sort keys (≤3), visible/ordered columns, row height; kanban: `stack_by_column_id`, `wip_limits`; calendar: `date_column_id`; form: full form config (fields, required, confirmation, redirect) |
| `public_slug` | citext UNIQUE null | forms only: `forms.trellis.app/f/{slug}` |
| timestamps · `deleted_at` | | |

**Filter storage shape** (same shape the API accepts, doc 04 §3.4): `{"op":"and","rules":[{"column_id":"…","cmp":"is_any_of","value":["lbl_done"]}]}`.

### 4.2 `share_links` (client access — the wedge)

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `board_id` · `view_id` | | link always scopes to a **saved view** |
| `token_hash` | bytea UNIQUE | URL carries `share.trellis.app/s/{token}`; only hash stored |
| `mode` | text | `view · comment` |
| `visible_column_ids` | uuid[] | whitelist — hidden columns are never serialized (Stage 1) |
| `password_hash` | text null · `expires_at` null · `revoked_at` | |
| `created_by` · `access_count` int · `last_accessed_at` | | shown on the guest-audit page |

### 4.3 `share_link_visitors`

Client commenters verify with a 6-digit email code (Stage 1): `(id, share_link_id, org_id, email citext, name, verified_at, last_code_hash, code_expires_at, code_attempts smallint)`. `UNIQUE(share_link_id, email)`. Comments they post reference `visitor_id` instead of `author_id` (§5.1).

### 4.4 `form_submissions`

Audit trail + quota counter feed: `(id, org_id, view_id, item_id created, submitted_at, ip inet, raw_payload jsonb)`. **Index:** `ix(view_id, submitted_at)`. Retention 6 months. Monthly quota (10k/org) counted in Redis, reconciled from this table.

---

## 5. Collaboration

### 5.1 `comments` (item "Updates")

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `item_id` | | |
| `parent_comment_id` | uuid null | one level; trigger rejects replies-to-replies |
| `author_id` | uuid null | null when posted via share link ⇒ `visitor_id` set |
| `visitor_id` | uuid FK share_link_visitors, null | exactly one of author/visitor non-null (`CHECK`) |
| `body` | jsonb | ProseMirror/TipTap doc (rich text, checklists, mentions as nodes) |
| `body_text` | text | trigger-flattened plain text → search |
| `edited_at` · `deleted_at` | | soft delete keeps thread shape ("message deleted") |

**Indexes:** `ix(item_id, created_at)`, GIN on `to_tsvector('simple', body_text)` for MVP search.
**`comment_reactions`:** `(comment_id, user_id, emoji text)`, `UNIQUE(comment_id, user_id, emoji)`.

### 5.2 `files` + `attachments`

`files` = physical object; `attachments` = where it appears (a file pasted in one update and later attached to a cell is one `files` row, two `attachments`).

**`files`**

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `uploader_id` | | |
| `storage_key` | text | `org/{org_id}/{file_id}` in S3 — never guessable-public |
| `filename` text · `mime_type` text · `size_bytes` bigint · `sha256` bytea | | size ≤ 100 MB (`entitlements`) |
| `scan_status` | text | `pending · clean · infected · skipped` — downloads blocked until ≠ pending/infected |
| `kind` | text | `upload · gdrive_link · paste` |
| `image_width`/`image_height` int null · `created_at` · `deleted_at` | | |

**`attachments`:** `(id, org_id, file_id, target_type text: comment · column_value · form_submission, comment_id null, item_id null, column_id null, created_at)` — explicit nullable FKs instead of a polymorphic `target_id` so referential integrity is real. **Indexes:** `ix(item_id)`, `ix(comment_id)`, `ix(file_id)`.

**Scalability:** `organizations.storage_used_bytes` maintained by trigger on files insert/delete; quota checked **before** issuing the presigned upload (doc 03 §7).

### 5.3 `activity_events` (item/board history — user-facing)

Distinct from `audit_logs` (§8): this is product history ("Status: Working on it → Done"), high-volume, 1-year retention.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `org_id` · `board_id` · `item_id` null · `actor_id` null | | actor null = automation/system (then `automation_id` set) |
| `event_type` | text | `item.created`, `item.moved`, `column_value.changed`, `comment.posted`, `item.archived`, … |
| `payload` | jsonb | e.g. `{"column_id":"…","from":{"label_id":"lbl_wip"},"to":{"label_id":"lbl_done"}}` |
| `board_seq` | bigint | copy of `boards.event_seq` at write time — real-time resync cursor (doc 03 §5) |
| `created_at` | | |

**Partitioning:** `PARTITION BY RANGE (created_at)`, monthly. Retention = drop partitions older than 12 months (fast, no vacuum churn).
**Indexes (per partition):** `ix(item_id, created_at DESC)`, `ix(board_id, board_seq)`, BRIN on `created_at`.

### 5.4 `notifications`

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `user_id` (recipient) | | |
| `event_type` | text | catalog from Stage 1 §2.6 (`assigned`, `mentioned`, `reply`, `due_soon`, `automation_failed`, …) |
| `actor_id` null · `item_id` null · `board_id` null · `comment_id` null | | |
| `payload` | jsonb | denormalized snippet for rendering without joins: `{"item_name":"…","board_name":"…","preview":"…"}` |
| `read_at` · `emailed_at` · `created_at` | | `emailed_at` set by instant-send or digest job (dedupe) |

**Indexes:** `ix(user_id, created_at DESC)`, partial `ix(user_id) WHERE read_at IS NULL` (badge count). **Retention:** pruned at 180 days. Monthly partitions once volume warrants (> ~50M rows).

### 5.5 `notification_preferences` / `board_mutes`

`notification_preferences(user_id PK, email_cadence text: instant · hourly · daily · off, dnd jsonb {"start":"22:00","end":"07:00","days":[…]}, channel_overrides jsonb per event_type)`. `board_mutes(user_id, board_id, created_at)`, `UNIQUE(user_id, board_id)`.

---

## 6. Automations & Platform

### 6.1 `automations`

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `board_id` | | |
| `name` | text | auto-generated from recipe if blank |
| `enabled` | bool · `created_by` · `version` int | version bumps on edit; runs record the version they executed |
| `trigger` | jsonb | `{"type":"status_changed","column_id":"…","to_label_id":"lbl_stuck"}` · `{"type":"date_arrives","column_id":"…","offset_days":-1,"at":"09:00"}` · `{"type":"cron","every":"week","weekday":1,"at":"08:00"}` … |
| `conditions` | jsonb | array ≤ 3 of column-value tests, same comparator vocabulary as view filters |
| `actions` | jsonb | ordered array (V1: length 1; V2: ≤ 5): `[{"type":"notify","target":"creator"},{"type":"move_to_group","group_id":"…"}]` |
| `last_run_at` · `disabled_reason` text null | | e.g. `quota_exceeded`, auto-set with owner notification |

**Index:** `ix(board_id) WHERE enabled` — the matcher loads a board's recipes on event; cached in Redis keyed by `(board_id, max(version))`.

### 6.2 `automation_runs`

Pillar 3 — every run is logged, success or failure.

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `automation_id` · `board_id` · `trigger_item_id` null | | |
| `status` | text | `succeeded · failed · skipped_condition · quota_exceeded · loop_stopped` |
| `chain_depth` | smallint | 0–3; 3 ⇒ chain halted & flagged (Stage 1) |
| `trigger_snapshot` | jsonb | what fired it: event + relevant values at trigger time |
| `actions_log` | jsonb | per-action outcome `[{"type":"notify","ok":true,"ms":12}]` |
| `error` | jsonb null | code, message, provider response for integration actions |
| `started_at` / `finished_at` | | |

**Partitioning:** monthly by `started_at`; retention 90 days. **Indexes:** `ix(automation_id, started_at DESC)`, `ix(board_id, started_at DESC)`. Monthly run quota (25k/org) counted in Redis `org:{id}:runs:{yyyymm}`, reconciled nightly from this table.

### 6.3 `outbox` (transactional event bus feed)

Every domain mutation writes its event here **in the same transaction**; a relay publishes to Redis Streams for real-time, automations, webhooks, search, and notifications (doc 03 §6). At-least-once; consumers dedupe on `id`.

| Field | Type | Notes |
|---|---|---|
| `id` uuid PK · `org_id` · `board_id` null | | |
| `event_type` text · `payload` jsonb · `created_at` | | |
| `published_at` | timestamptz null | relay marks; rows deleted after 24 h |

**Index:** partial `ix(created_at) WHERE published_at IS NULL` — stays near-empty in steady state.

### 6.4 `webhooks` / `webhook_deliveries`

**`webhooks`:** `(id, org_id, board_id, url, events text[] ⊆ {item.created, item.updated, item.deleted, column_value.changed, update.posted, form.submitted}, column_filter_id uuid null, secret_enc bytea, is_active bool, consecutive_failures int, disabled_at, created_by)`. Auto-disabled at 100 consecutive failures (Stage 1).

**`webhook_deliveries`:** `(id, org_id, webhook_id, event_id, event_type, payload jsonb, attempt smallint, response_status int null, error text null, delivered_at null, next_retry_at null, created_at)`. Monthly partitions, 30-day retention. **Index:** `ix(webhook_id, created_at DESC)`; partial `ix(next_retry_at) WHERE delivered_at IS NULL`.

### 6.5 `integration_connections`

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` | | |
| `provider` | text | `slack · google_drive · zapier · google_calendar · github · teams …` |
| `external_account_id` | text | Slack team id, Google account, … |
| `access_token_enc` / `refresh_token_enc` | bytea | AES-256-GCM, KMS envelope keys |
| `scopes` text[] · `status` text (`active · revoked · error`) · `connected_by` · `config` jsonb | | e.g. Slack default channel map |

`UNIQUE(org_id, provider, external_account_id)`. Integration-action quota (25k/mo) counted in Redis like automation runs.

### 6.6 AI

Built from MVP, not deferred — AI is pillar 4 of the product (01 §1.1), so usage-data collection has to start as soon as the first feature ships.

**`ai_interactions`** — logs every AI suggestion shown, accepted, edited, or dismissed (09 §4); the concrete mechanism for the "revisit with real usage data" evaluation loop.

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `user_id` | | |
| `feature` | text | `nl_search · summarize_thread · task_generation · automation_suggestion · dashboard_insight · meeting_to_task · project_planning · workflow_suggestion · risk_detection · assistant` |
| `board_id` null · `item_id` null | | context, when applicable |
| `input_summary` | text | truncated prompt/query — never the full raw content, to bound what's retained |
| `output` | jsonb | what was suggested |
| `outcome` | text | `shown · accepted · edited_then_accepted · dismissed` |
| `latency_ms` int · `created_at` | | |

**Indexes:** `ix(org_id, feature, created_at)` (product analytics), `ix(user_id, created_at)`.

**`ai_drafts`** — the pending-suggestion tray (09 §2): AI-generated items/boards awaiting one-click confirm, never written to `items`/`boards` until accepted.

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `user_id` · `board_id` | | |
| `interaction_id` | uuid FK `ai_interactions` | |
| `kind` | text | `draft_items · draft_board` |
| `payload` | jsonb | proposed item(s)/group(s) in the same canonical shapes as Appendix A — confirming a draft calls the identical `POST /items` path a manual create would (05 §10.3 pattern: no shadow write path) |
| `status` | text | `pending · accepted · discarded` |
| `expires_at` | timestamptz | unconfirmed drafts auto-discard after 7 days |

No new table is needed for the read-only AI features — natural-language search translates into the existing filter DSL (02 §4.1) and dashboard insights/workflow suggestions narrate data already fetched — only features that *create* content need a draft/confirm table.

---

## 7. Reporting

### 7.1 `dashboards`

`(id, org_id, workspace_id, name ≤ 80, description, created_by, timestamps, deleted_at)`. Access follows workspace membership; client-shareable dashboard links (V2) will reuse `share_links` with `dashboard_id`.

### 7.2 `widgets`

| Field | Type | Notes |
|---|---|---|
| `id` PK · `org_id` · `dashboard_id` | | max 30/dashboard |
| `type` | text | `counter · chart · battery · timeline · todo · text` (V1 set) |
| `title` | text ≤ 80 | |
| `layout` | jsonb | `{"x":0,"y":2,"w":6,"h":4}` grid units |
| `config` | jsonb | `{"board_ids":[…] ≤20, "column_id":"…","group_by":"status","chart":"bar","filters":{…}}` |

Widget queries hit read paths with the viewer's permissions — a widget never shows data from boards its **viewer** can't access (per-viewer evaluation, doc 03 §4).

---

## 8. Governance

### Permission model (resolution summary — full algorithm in doc 03 §4)

No single "permissions" table; permissions are the composition of:

1. `org_memberships.role` (admin / member / viewer / guest)
2. Workspace access (`workspaces.type` + `workspace_members`)
3. Board access (`boards.type` + `board_members.permission_level`)
4. Column visibility (`columns.visibility`, ENT)
5. Share-link scope (`share_links.mode` + `visible_column_ids`)

Precedence: org admin bypasses 2–3 (not 5 — share links are still scoped); the most specific explicit grant wins; guests **must** have a `board_members` row.

### `audit_logs` (security/admin trail — ENT-visible, recorded from day one)

| Field | Type | Notes |
|---|---|---|
| `id` uuid PK · `org_id` | | |
| `actor_id` null · `actor_ip` inet · `event` text | | 24-event catalog from Stage 1 §2.8 |
| `target_type` text · `target_id` uuid null · `metadata` jsonb | | |
| `created_at` | | |

Append-only: app role has `INSERT`-only grant (no UPDATE/DELETE). Monthly partitions, 2-year retention. **Indexes:** `ix(org_id, created_at DESC)`, `ix(org_id, event, created_at DESC)`. Recording from day one is cheap and makes the ENT phase a UI project, not a data project.

---

## 9. Monetization — DORMANT (do not create yet)

Per the free-for-now decision (01 §2.9), **no billing tables are created in any current phase.** Shapes are reserved here so a future migration is additive and the `entitlements` module has a stable contract:

- **`subscriptions`** *(reserved)*: `id, org_id UNIQUE, plan, status (trialing · active · past_due · canceled), seats int, current_period_start/end, external_customer_id, external_subscription_id, cancel_at_period_end bool, timestamps`.
- **`invoices`** *(reserved)*: `id, org_id, subscription_id, number text UNIQUE, amount_cents int, currency char(3), status (draft · open · paid · void), issued_at, paid_at, external_invoice_id, pdf_file_id`.

What **is** built now: the `entitlements` module (code, not schema) — every quota check (`storage`, `automation_runs`, `workspaces`, `api_rate`, `file_size`, …) calls `entitlements.check(org_id, key)`, which today reads static free-tier config + `organizations.quota_overrides`. Introducing plans later = point it at `subscriptions`, zero data migration.

---

## Appendix A — `column_values.value` canonical shapes

| Column type | `value` shape | Extracted to |
|---|---|---|
| `status` | `{"label_id":"lbl_done"}` | `text_value` = label text |
| `text` / `long_text` | `{"text":"…"}` | `text_value` |
| `number` | `{"number":12.5}` | `number_value` |
| `person` | `{"user_ids":["uuid",…]}` | GIN |
| `date` | `{"date":"2026-07-14","time":"09:00"}` (time null ok) | `date_value` |
| `timeline` | `{"start":"2026-07-01","end":"2026-07-18"}` | `date_value` = start |
| `dropdown` | `{"option_ids":["opt_1"]}` | `text_value` = joined labels |
| `checkbox` | `{"checked":true}` | `number_value` 0/1 |
| `tags` | `{"tag_ids":["uuid",…]}` | GIN |
| `link` | `{"url":"https://…","text":"Brief"}` | `text_value` |
| `email` / `phone` | `{"email":"…"}` / `{"phone":"+31612345678","country":"NL"}` | `text_value` |
| `file` | `{"file_ids":["uuid",…]}` (≤ 25) | — |
| `rating` | `{"rating":4}` | `number_value` |
| `dependency` | `{"predecessors":[{"item_id":"…","type":"fs","lag_days":0}]}` (V1 type always `fs`) | — |
| `time_tracking` | `{"duration_seconds":7320,"running_user_id":null}` (denormalized; truth = `time_entries`) | `number_value` |
| `formula` / `mirror` | **not stored** — computed at read | — |
| `connect_boards` | `{"linked_item_ids":["uuid",…]}` | — |

## Appendix B — Sizing & partition triggers

Assumptions at "V1 success" (500 weekly-active teams ≈ 5k orgs total):

| Table | Est. rows | Est. size | Partitioned? |
|---|---|---|---|
| `items` | ~10 M | ~4 GB | No — hash by `org_id` past 500 M |
| `column_values` | ~100 M | ~60 GB | No — hash by `board_id` past 500 M |
| `activity_events` | ~150 M/yr | ~75 GB | **Yes** — monthly range, drop > 12 mo |
| `automation_runs` | ~20 M/qtr | ~15 GB | **Yes** — monthly, drop > 90 d |
| `audit_logs` | low | small | **Yes** — monthly, drop > 24 mo |
| `notifications` | ~50 M live | ~25 GB | Prune > 180 d; partition when slow |
| `webhook_deliveries` | churn-heavy | small | **Yes** — monthly, drop > 30 d |

Retention jobs and partition management: doc 03 §6 (`retention-pruner`).

---

*Next: [03-backend-architecture.md](03-backend-architecture.md) — how these tables are served.*
