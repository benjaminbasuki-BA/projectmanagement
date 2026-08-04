# CLAUDE.md

Trellis — an AI-powered, monday.com-style project management SaaS for client-facing teams (agencies, consultancies, service businesses). Full product blueprint lives in `/docs`; start at [docs/00-index.md](docs/00-index.md) if you need detail beyond what's below. This file is the fast-context summary — check the docs, not just this file, before making a non-trivial architectural call.

---

## 🚧 Current scope: MVP only

**We are building MVP scope right now — nothing past it.** Full definition: [docs/01-vision-and-scope.md](docs/01-vision-and-scope.md) §3.2. Sprint-by-sprint build order (what table/feature lands in which sprint): [docs/08-roadmap.md](docs/08-roadmap.md) §3.

**Do not build V1, V2, or Enterprise features, even opportunistically while touching related code.** If a task seems to require one, stop and flag it rather than adding it "since I'm already in here." Every feature/table/column type in docs 01–10 is tagged `MVP` / `V1` / `V2` / `ENT` — check the tag before building. When unsure, treat it as **not yet in scope**.

**MVP covers:** auth (email+password, Google OAuth, 2FA opt-in), single workspace per account, main + private boards, groups, items, 8 column types (`status`, `text`, `long_text`, `number`, `person`, `date`, `dropdown`, `checkbox`), Table + Kanban views only, filters/saved views, comments+activity log, in-app+email notifications, `@person` mentions, board-level `⌘K` search, 6 starter templates, responsive mobile web, CSV import/export, basic admin. AI in MVP is limited to **natural-language search** and **thread summarization** only — every other AI feature (task generation, automation suggestions, dashboard insights, meeting-to-task, project planning, workflow suggestions, risk detection, the AI assistant) is V1 or later.

**Explicitly NOT in MVP** (don't build): subitems, folders, multiple workspaces, Timeline/Gantt/Calendar views, forms, dashboards, the automations engine, integrations beyond CSV, guest accounts/client share links, public API/webhooks, time tracking, dependencies, recurring items, teams/`@team`, global cross-workspace search, PWA push.

---

## Constraint: free during development — no billing

**The product is free. Do not build billing, subscriptions, or payment code of any kind.** No Stripe, no plan tiers, no paywalls, no upgrade prompts, no trial logic. `organizations.plan` is always `'free'`. The `subscriptions` and `invoices` tables are **not created** — their shape is only reserved/documented in [docs/02-data-model.md](docs/02-data-model.md) §9 for a possible future migration.

What _is_ built: an `entitlements` module that every quota check (storage, automation runs, API rate, file size, …) routes through. These are **fair-use / abuse-prevention limits, not pricing** — don't gate features behind them as if they were a paid tier.

---

## Tech stack

**Backend** — TypeScript / Node.js 22 LTS, modular monolith in one repo, three deployable processes from one image (`api`, `ws-gateway`, `worker`):

| Layer               | Choice                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| HTTP                | Fastify + Zod (`fastify-type-provider-zod`); OpenAPI generated from the same Zod schemas                         |
| ORM / DB            | Drizzle ORM + raw SQL for hot paths → **PostgreSQL 16**                                                          |
| Cache/queues/events | Redis 7 — BullMQ (jobs), Streams (outbox relay for events), cache, rate limits, quota counters                   |
| Real-time           | Socket.IO on `ws-gateway`, Redis Streams adapter                                                                 |
| Search              | Postgres FTS (MVP) — **do not add Meilisearch yet**, that's V1                                                   |
| Files               | S3 + CloudFront signed URLs, imgproxy (thumbnails), ClamAV (AV scan)                                             |
| Email               | Postmark + `react-email`                                                                                         |
| AI                  | Provider-agnostic `ai` module wrapping a hosted LLM API — **never call a vendor SDK directly from feature code** |
| Auth                | Session cookie (web/PWA) or PAT bearer token (API); argon2id passwords; TOTP 2FA                                 |

Multi-tenancy: `org_id` on every tenant table + Postgres RLS (defense in depth) + app-layer `TenantContext` middleware. Cross-tenant access must 404, never 403 (don't leak existence).

**Frontend** — React 19 + TypeScript, Vite:

| Layer        | Choice                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Routing      | React Router v7 (data mode)                                                                    |
| Server state | TanStack Query — all server data lives here, never in Zustand                                  |
| Table/grid   | TanStack Table + TanStack Virtual (virtualize; target smooth at 20k items/board)               |
| UI state     | Zustand — transient/local only (e.g. "which cell is editing")                                  |
| Drag & drop  | dnd-kit (all of it — rows, kanban, resize handles)                                             |
| Rich text    | TipTap — matches the `comments.body` jsonb shape stored in Postgres                            |
| Forms        | react-hook-form + Zod resolver, sharing schemas with the backend via `packages/schemas`        |
| Styling      | Tailwind + Radix primitives, copied into `packages/ui` (shadcn-style — not an npm runtime dep) |
| Real-time    | socket.io-client                                                                               |

**Hosting** — AWS (ECS Fargate, RDS, ElastiCache, S3/CloudFront, KMS, Secrets Manager), Terraform, GitHub Actions CI/CD. Envs: `dev` (docker-compose) → `staging` → `prod`. Sentry (errors) + OpenTelemetry → Grafana Cloud (metrics/logs/traces).

Full rationale (incl. rejected alternatives) for every choice: [docs/03-backend-architecture.md](docs/03-backend-architecture.md) §2, [docs/06-frontend-architecture.md](docs/06-frontend-architecture.md) §1.

---

## Data model conventions

- **IDs:** UUIDv7 everywhere (time-ordered, safe in URLs). Items also get a human-facing `display_seq`, a per-org counter rendered `TRL-1042` — this is a display field, **not** the primary key.
- **Naming:** snake_case, plural table names, FKs as `<entity>_id`, enums as `text` + `CHECK` constraint (never native Postgres enums — painful to `ALTER`).
- **Tenancy:** every tenant-owned table gets `org_id uuid NOT NULL`, even when derivable via a join — required for RLS policies and cheap tenant-scoped indexes. Never skip this on a new table.
- **Timestamps:** `timestamptz`, UTC. `created_at DEFAULT now()` always; mutable tables add `updated_at` via trigger.
- **Soft delete:** user-facing content uses `archived_at`/`deleted_at` with 30-day recovery, purged by a nightly job. Log/history tables (`audit_logs`, `activity_events`) are append-only and expire by dropping old partitions, not per-row deletes.
- **Ordering:** user-sortable rows (groups, items, columns, views) use a LexoRank-style `position text` column — reordering writes one row, never a bulk reindex.
- **`column_values` is sparse EAV:** a row exists only when a cell is non-empty, composite PK `(item_id, column_id)`, canonical jsonb `value` per column type + extracted `text_value`/`number_value`/`date_value` columns for indexing/sorting. Check [docs/02-data-model.md](docs/02-data-model.md) Appendix A for the exact shape per type before writing any column-value code.
- **Subitems are not a separate table** — they're rows in `items` with `parent_item_id` set (relevant once subitems are in scope; they're V1, not MVP).
- **Migrations:** Drizzle Kit, one linear `migrations/` directory.

Full schema: [docs/02-data-model.md](docs/02-data-model.md).

---

## Folder / repo structure

Turborepo + pnpm monorepo:

```
trellis/
├── apps/
│   ├── web/                 # React SPA — all MVP frontend work happens here
│   │   └── src/
│   │       ├── app/          # React Router route tree, layouts
│   │       ├── features/     # auth/, boards/, items/, views/, notifications/, search/, settings/ (MVP)
│   │       │                 #   automations/, dashboards/, templates/ are V1 — don't scaffold yet
│   │       ├── realtime/     # socket.io client, room manager
│   │       └── lib/          # api-client wiring, query keys, auth context
│   └── mobile/               # V2 — do not create yet
├── packages/
│   ├── ui/                   # design system (Button, Avatar, StatusChip, DatePicker…)
│   ├── schemas/               # Zod schemas shared frontend/backend — single source of truth
│   └── api-client/            # typed client generated from the OpenAPI spec
└── turbo.json
```

Backend module boundaries (lint-enforced — no cross-module imports except via each module's `index.ts`): `auth`, `boards`, `items`, `notifications`, `files`, `search`, `entitlements`, `ai`, `audit`. `audit` logging is active from MVP even though its viewing UI is Enterprise-only — keep writing `audit_logs` events as auth/admin actions are built, don't defer it. The `automations` and `integrations` modules are **V1 — don't scaffold yet**.

Full structure/rationale: [docs/06-frontend-architecture.md](docs/06-frontend-architecture.md) §1–2, [docs/03-backend-architecture.md](docs/03-backend-architecture.md) §1.

---

## When unsure

Check the phase tag in the relevant doc section, or the sprint it's assigned to in [docs/08-roadmap.md](docs/08-roadmap.md). If something isn't tagged MVP, it isn't in scope yet — ask rather than build it.
