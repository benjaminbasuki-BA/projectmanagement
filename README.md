# Trellis

An AI-powered, monday.com-style project management SaaS for client-facing teams. Full product blueprint: [`docs/00-index.md`](docs/00-index.md). Architecture and scope conventions for coding sessions: [`CLAUDE.md`](CLAUDE.md).

**Current state:** project scaffolding, the full MVP database schema, authentication + multi-tenancy (signup/login/sessions, organizations, workspaces, org-scoped data access), MVP CRUD APIs (boards, groups, columns, items, column values, views), and a minimal end-to-end frontend flow — sign up, create an org/workspace/board, add columns, create items, and edit cells in a table view. Kanban, filters, real-time, and the rest of the MVP surface aren't built yet — see [`CLAUDE.md`](CLAUDE.md) for what's in scope.

## Stack

- **Frontend** (`apps/web`): React 19 + TypeScript, Vite, React Router v7, Tailwind CSS
- **Backend** (`apps/api`): Node.js + TypeScript, Fastify, Drizzle ORM, PostgreSQL
- **Shared** (`packages/*`): `ui` (design system), `schemas` (Zod schemas shared frontend/backend), `api-client` (typed API client, generated later)
- Monorepo managed with **Turborepo** + **pnpm workspaces**

Full rationale for every choice: [`docs/03-backend-architecture.md`](docs/03-backend-architecture.md) §2, [`docs/06-frontend-architecture.md`](docs/06-frontend-architecture.md) §1.

## Prerequisites

- Node.js ≥ 22
- pnpm ≥ 11 (`npm install -g pnpm` if you don't have it)
- Docker (for local Postgres) — or point `DATABASE_URL`/`APP_DATABASE_URL` at any Postgres 16 instance you already have running

## Setup

1. **Install dependencies** (from the repo root — this installs every workspace package):

   ```bash
   pnpm install
   ```

2. **Copy environment files** and adjust if needed (defaults match `docker-compose.yml`):

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

3. **Start local Postgres:**

   ```bash
   docker compose up -d
   ```

4. **Run database migrations** (creates the schema, the non-superuser `app_user` role, and Row-Level Security policies — see [`apps/api/drizzle`](apps/api/drizzle)):

   ```bash
   pnpm --filter api db:migrate
   ```

   `apps/api` connects to Postgres with **two different roles**, and both env vars matter:
   - `DATABASE_URL` — the table-owning superuser (matches docker-compose's `POSTGRES_USER`). Used only by `drizzle-kit generate`/`migrate`.
   - `APP_DATABASE_URL` — the `app_user` role created by `drizzle/0002_tenancy_and_rls.sql`. Used by the actual running server, so Row-Level Security policies are enforced against it rather than silently bypassed for a table owner (Postgres exempts owners from RLS by default).

## Running the dev servers

From the repo root, this starts both `apps/web` and `apps/api` in parallel via Turborepo:

```bash
pnpm dev
```

- Frontend: **http://localhost:5173**
- Backend: **http://localhost:3001**

Or run just one app: `pnpm --filter web dev` / `pnpm --filter api dev`.

**No Docker?** `pnpm --filter api dev:pglite` runs the API against an in-process Postgres (PGlite) with all migrations applied — same engine the test suite uses. Data is in-memory and lost on restart, but it's enough to run the whole app locally.

### Using the app

Open **http://localhost:5173** — you'll land on the login page. Sign up, name your organization, create a workspace and a board (it comes with a default group and Status column), add columns, and create items in the table view. Status/text/number/date/checkbox cells are editable inline.

To check the backend directly:

```bash
curl http://localhost:3001/health
# {"status":"ok","timestamp":"...","db":"connected"}
```

If `db` comes back `"unreachable"`, make sure `docker compose up -d` is running and migrations have been applied (or use `dev:pglite`).

### Trying the API directly (curl)

```bash
# Sign up (sets a session cookie)
curl -i -c cookies.txt -X POST http://localhost:3001/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"correct-horse-battery","name":"You"}'

# Create an organization (becomes admin, pins it as the session's active org)
curl -b cookies.txt -X POST http://localhost:3001/v1/organizations \
  -H "Content-Type: application/json" \
  -d '{"name":"My Agency","slug":"my-agency"}'

# Create a workspace, then a board inside it
curl -b cookies.txt -X POST http://localhost:3001/v1/workspaces \
  -H "Content-Type: application/json" -d '{"name":"Client Work"}'
# → note the returned workspace id as $WS
curl -b cookies.txt -X POST http://localhost:3001/v1/workspaces/$WS/boards \
  -H "Content-Type: application/json" -d '{"name":"Acme — Website Redesign"}'
# → note the returned board id as $BOARD

# Add a group, a status column, and an item with that cell already set
curl -b cookies.txt -X POST http://localhost:3001/v1/boards/$BOARD/groups \
  -H "Content-Type: application/json" -d '{"title":"Backlog"}'
# → note the group id as $GROUP
curl -b cookies.txt -X POST http://localhost:3001/v1/boards/$BOARD/columns \
  -H "Content-Type: application/json" \
  -d '{"title":"Status","type":"status","settings":{"labels":[{"id":"lbl_wip","text":"Working on it","color":"#FDAB3D","is_done":false}]}}'
# → note the column id as $COL
curl -b cookies.txt -X POST http://localhost:3001/v1/boards/$BOARD/items \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Homepage hero design\",\"groupId\":\"$GROUP\",\"columnValues\":{\"$COL\":{\"label_id\":\"lbl_wip\"}}}"

curl -b cookies.txt http://localhost:3001/v1/boards/$BOARD/items
```

## Testing

`apps/api` has a real integration test suite (Vitest) that runs against an in-process Postgres (PGlite — actual Postgres compiled to WASM, migrated with the real migration files, not a mock) — no Docker needed to run it:

```bash
pnpm --filter api test
```

Covers signup/login/session validation, org and workspace creation, and — the important one — that Row-Level Security actually blocks cross-tenant reads/writes at the database layer, independent of the application code's own filtering (`src/db/tenant-db.test.ts`).

## Other commands

| Command                         | What it does                                                |
| ------------------------------- | ----------------------------------------------------------- |
| `pnpm build`                    | Build all apps/packages (via Turborepo)                     |
| `pnpm lint`                     | Lint all apps/packages                                      |
| `pnpm typecheck`                | Type-check all apps/packages                                |
| `pnpm format`                   | Format the repo with Prettier                               |
| `pnpm format:check`             | Check formatting without writing                            |
| `pnpm --filter api test`        | Run the backend integration test suite                      |
| `pnpm --filter api db:generate` | Generate a Drizzle migration from `apps/api/src/db/schema/` |
| `pnpm --filter api db:migrate`  | Apply pending migrations                                    |
| `pnpm --filter api db:studio`   | Open Drizzle Studio against the local database              |

## Project structure

```
trellis/
├── apps/
│   ├── web/        # React SPA
│   └── api/        # Fastify API
│       ├── drizzle/          # SQL migrations (source of truth for the schema)
│       └── src/
│           ├── db/           # schema (src/db/schema/), tenant-scoped query helper
│           ├── modules/       # auth/, organizations/, workspaces/ — each with its
│           │                  #   own routes.ts/schemas.ts + an index.ts public interface
│           ├── middleware/    # requireOrgContext (tenancy resolution)
│           └── test/          # PGlite-backed test db factory
├── packages/
│   ├── ui/          # shared design system
│   ├── schemas/     # shared Zod schemas
│   └── api-client/  # typed API client (generated once an OpenAPI spec exists)
├── docs/            # full product blueprint (10 docs, start at 00-index.md)
├── docker-compose.yml
└── CLAUDE.md        # scope/stack/conventions for coding sessions
```

## Docs

Read [`CLAUDE.md`](CLAUDE.md) before adding anything beyond what's already built — it states the current MVP-only scope and the free/no-billing constraint. For the full spec, start at [`docs/00-index.md`](docs/00-index.md).
#   p r o j e c t m a n a g e m e n t  
 