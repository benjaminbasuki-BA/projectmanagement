# 06 — Frontend Architecture

| | |
|---|---|
| **Product** | Trellis |
| **Document** | Stage 3 of 4 — Frontend Architecture |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-10 |
| **Depends on** | [01](01-vision-and-scope.md), [02](02-data-model.md), [03](03-backend-architecture.md), [04](04-api-design.md), [05](05-automation-engine.md) |

---

## 1. Recommended Tech Stack (with rationale)

| Layer | Choice | Rationale | Rejected alternative & why |
|---|---|---|---|
| Framework | **React 19 + TypeScript**, built with **Vite** | Matches the TS-first backend (shared Zod schemas, doc 03); Vite gives sub-second HMR the board editor's iteration speed depends on | Next.js: SSR/RSC buys little for an authenticated app-shell product and adds a server the small team must run |
| Routing | **React Router v7** (data mode, file-free config) | Mainstream, huge hiring pool, mature nested-layout + data-loader model fits the shell/board/panel nesting (§3) | TanStack Router: excellent type safety, but doc 03's own logic ("a 6-person team can't afford niche infra") applies here too — React Router is the safer default |
| Server state / caching | **TanStack Query** | Purpose-built for REST + cursor pagination (04 §1); optimistic updates with automatic rollback are exactly what inline cell editing *and* AI draft accept/discard (§9) need | Redux + manual fetching: reinvents caching, staleness, retries that Query gives for free |
| AI client integration | Streamed responses (SSE) consumed via a thin hook (`useAiSuggestion`) that lands results straight into the same TanStack Query cache as a normal mutation | AI is pillar 4 (01 §1.1), not a bolt-on widget — reusing the mutation/cache plumbing means an accepted AI draft behaves identically to a manual create, no parallel state system | A dedicated chat-UI library: pulls in scope for something that's a suggestion surface, not a chat product (01 §1.1 "what Trellis is not") |
| Client/UI state | **Zustand** | Small stores per concern (active board, selection, builder drafts) without Redux boilerplate | Redux Toolkit: more ceremony than a small team's UI-only state needs |
| Real-time | **socket.io-client**, one connection multiplexed across joined rooms | Matches the `ws-gateway` Socket.IO server (03 §5) — rooms, auto-reconnect, `last_seq` resync built in | Raw WebSocket: rebuilds reconnect/backoff/rooms from scratch |
| Table/grid | **TanStack Table** (headless) + **TanStack Virtual** | Virtualized rendering is a hard requirement at 20,000 items/board (01 §2.3); headless keeps full control over the spreadsheet-like cell UX | AG Grid: powerful but a licensed, opinionated black box that fights custom cell types (formula, mirror) |
| Drag & drop | **dnd-kit** | Accessible (keyboard + screen reader sensors), modular enough for row-reorder, kanban cross-lane drag, Gantt bar resize, and dashboard widget layout with one library | react-beautiful-dnd: unmaintained since 2022 |
| Rich text | **TipTap** (ProseMirror) | The exact editor whose document shape `comments.body` already stores (02 §5.1) — no format-conversion layer | Draft.js: unmaintained; Slate: less mature collaborative-editing story |
| Forms | **react-hook-form + Zod resolver** | Shares the same Zod schemas as the API request bodies (04 §1) via a `packages/schemas` package — one source of truth for "what's a valid item name" | Formik: no first-class Zod integration, more re-renders |
| Charts | **Recharts** (dashboards §9), **visx** as escape hatch for bespoke widgets (Battery) | Recharts covers 5 of 6 MVP widget types with minimal code; visx's low-level primitives handle the one that doesn't (a radial/battery meter) | Chart.js: canvas-based, harder to theme per-client-portal (client-branded views, 01 §2.8) |
| Styling / components | **Tailwind CSS + Radix UI primitives**, assembled shadcn/ui-style (copied into `packages/ui`, not an npm runtime dep) | Copy-in components mean full control over theming for client-branded share links (01 §2.8) without ejecting from a library later | MUI/Ant: heavy runtime, harder to strip branding for white-label client views |
| Dates | **date-fns + date-fns-tz** | Tree-shakeable, matches per-user IANA timezone model (02 §1.2) | Moment: unmaintained, large bundle; Luxon: fine but redundant with date-fns already needed for the calendar view |
| PWA | **vite-plugin-pwa** | Delivers the V1 installable-PWA + push requirement (01 §2.9) with near-zero extra code | Hand-rolled service worker: unnecessary risk |
| Testing | **Vitest** (unit) + **React Testing Library** + **Playwright** (e2e, incl. the board drag/drop and real-time flows) | Vitest shares Vite config; Playwright is the only realistic way to test multiplayer real-time in a browser | Cypress: weaker multi-tab/multi-context support, which real-time collab testing needs |
| Monorepo | **Turborepo + pnpm workspaces** | Shared `packages/ui`, `packages/schemas`, and a generated `packages/api-client` (from the doc 04 OpenAPI spec) without publishing to npm | Nx: more powerful than a 6-person team's build graph needs |

---

## 2. Repository & Component Structure

```
trellis/
├── apps/
│   ├── web/                      # the SPA — everything in this document
│   │   └── src/
│   │       ├── app/               # React Router route tree, layouts (§3)
│   │       ├── features/
│   │       │   ├── auth/
│   │       │   ├── boards/         # board shell, groups, item grid
│   │       │   ├── items/           # item detail panel, cell editors
│   │       │   ├── views/           # table/kanban/timeline/calendar renderers
│   │       │   ├── automations/     # recipe builder + activity log (§10)
│   │       │   ├── dashboards/      # widget canvas + config panels (§9)
│   │       │   ├── templates/       # gallery (§11)
│   │       │   ├── notifications/
│   │       │   ├── search/
│   │       │   └── settings/        # account/org/board settings (§12)
│   │       ├── realtime/            # socket.io client, room manager, delta reducer
│   │       └── lib/                 # api-client wiring, query keys, auth context
│   └── mobile/                    # V2 — React Native, shares packages/schemas + packages/ui tokens
├── packages/
│   ├── ui/                        # design system: Button, Avatar, StatusChip, DatePicker, ColorPicker…
│   ├── schemas/                   # Zod schemas, shared with the API (single source of truth)
│   └── api-client/                # typed fetch client generated from the OpenAPI spec (doc 04)
└── turbo.json
```

**Each `features/*` module** follows the same internal shape: `components/` (dumb UI), `hooks/` (TanStack Query hooks — `useBoard`, `useItems`, `useCreateItem`), and, only where genuinely needed, `store.ts` (a Zustand slice for transient UI state like "which cell is being edited"). Server data never lives in Zustand — TanStack Query's cache is the only source of truth for anything that came from the API, which keeps optimistic-update rollback (§6) mechanical rather than bespoke per feature.

---

## 3. Main Pages & Navigation Structure

### Route map

| Path | Page |
|---|---|
| `/login` · `/signup` · `/forgot-password` | Auth |
| `/onboarding` | First-run wizard (doc 07 §1) |
| `/w/{workspaceSlug}` | Workspace home — board list |
| `/w/{workspaceSlug}/my-work` | Cross-board "My Work" (01 §2.9) |
| `/w/{workspaceSlug}/search` | Global search results (V1) |
| `/w/{workspaceSlug}/b/{boardId}/{viewSlug}` | **Board screen** — the core surface (§4) |
| `/w/{workspaceSlug}/b/{boardId}/automations` | Automation list + activity log (§10) |
| `/w/{workspaceSlug}/b/{boardId}/settings` | Board settings: columns, permissions, share links |
| `/w/{workspaceSlug}/dashboards/{dashboardId}` | Dashboard (§9) |
| `/templates` | Template gallery (§11) |
| `/settings/profile` · `/settings/notifications` · `/settings/security` | Personal settings |
| `/org/settings/members` · `/…/teams` · `/…/guests` · `/…/api-tokens` · `/…/usage` · `/…/audit-log` (ENT) | Org admin (§12) |
| `/s/{shareToken}` | **Client portal** — separate minimal shell, no sidebar, no Trellis chrome beyond the footer (01 §1.1 pillar 1) |
| `/f/{formSlug}` | Public form |

### App shell

```
┌─────────────────────────────────────────────────────────────┐
│ [Workspace ▾]        Acme — Website Redesign        [Share] [⚙] │  ← top bar
├───────┬─────────────────────────────────────────────────────┤
│ 🏠 My  │  Table   Kanban   Timeline   Calendar   [+ view]      │  ← view tabs
│    Work│─────────────────────────────────────────────────────│
│ 🔍 Search│ Filter▾  Sort▾  Group▾  🔍          [+ New item]     │  ← toolbar
│───────│─────────────────────────────────────────────────────│
│ ▾ Client Work                                                 │
│   • Acme — Website Redesign  ← active                         │
│   • Beacon Co — Rebrand                                       │
│ ▾ Internal Ops                                                │
│   • Studio Requests                                            │
│───────│                    board canvas (§4)                  │
│ Dash-  │                                                        │
│ boards │                                                        │
│ Temp-  │                                                        │
│ lates  │                                                        │
├───────┤                                                        │
│ + Invite│                                                       │
│ ⚙ Settings                                                     │
└───────┴─────────────────────────────────────────────────────┘
```

Left sidebar: workspace switcher at top (org has ≤ 20 workspaces, 01 §2.9), then a persistent nav block (My Work, Search, Notifications bell with unread badge), then the workspace tree (folders → boards, 3 levels deep per 02 §2.2), then Dashboards and Templates entries, then Invite/Settings pinned to the bottom. Collapsible to icon-only rail on narrow desktop viewports.

---

## 4. Board Interface Anatomy

The board screen is the single most-used surface in the product and gets the most engineering polish:

1. **Header row** — inline-editable board name (click to rename, matches Stage 1's fast/keyboard-first pillar), owner avatar, subscriber bell, `Share` button (opens the share-link modal, 01 §2.8), `⋯` menu (duplicate, archive, save as template).
2. **View tabs** — shared views as draggable tabs (reorder = `PATCH views/{id}` position), personal views in a `My views ▾` dropdown, `+` to add a view. Leftmost shared tab is the default landing view for new visitors (01 §2.3).
3. **Toolbar** — Filter (opens the filter builder, same rule shape as automation conditions, doc 05 §1.2), Sort, Group-by, quick-filter chips (*Assigned to me*, *Due this week*, *Overdue*), `⌘K` search affordance (natural-language capable from MVP — typing "things I'm behind on" parses into the same filter rules the Filter button builds, 09 §3.9), `+ New item`.
4. **Canvas** — the view-specific renderer (§5).
5. **Item detail panel** — clicking any item opens a **right-side slide-over** (not a route change, so the board stays mounted underneath): tabs for Main (columns), Updates (comments), Files, Activity, Subitems. The Updates tab carries a **Summarize** action once a thread passes ~10 replies (09 §3.6), reading the same TanStack Query cache already backing the comment list — no separate fetch. Closing the panel returns focus to the row that opened it. On mobile this becomes a full-screen route instead (§13).

---

## 5. Views

All views share one `useBoardItems(boardId, viewConfig)` TanStack Query hook — a view is a renderer over the same paginated/filtered item stream, matching the "views are lenses, not copies" principle from 01 §2.3.

**Table** — sticky header row, sticky first column (item name), TanStack Virtual windowing so only visible rows mount (smooth at 20k items). Column borders are drag handles (resize → debounced `PATCH columns/{id}`). Group headers are sticky mini-rows with a collapse chevron and a live aggregate footer (sum/avg/count per 01 §2.3). Row-select checkboxes appear on hover; selecting any row reveals a floating bulk-action bar (batch edit, ≤ 500 items, 04 §3.5).

**Kanban** — horizontal-scrolling lanes keyed by the `stack_by_column_id` (status/dropdown/person), each lane independently virtualized. Lane header shows a count badge, red at `count > wip_limit`. Cards render up to 6 chosen column chips, avatar stack, and a red due-date badge if overdue.

**Timeline / Gantt** *(one unified view, per 01 §2.3 — "Timeline/Gantt view" is a single view type, not two)* — split-pane: left is a minimal item list (name + owner), right is the day/week/month/quarter-zoomable canvas. Bars come from a `timeline` column (fallback: 1-day bar from a `date` column). A sticky "Today" vertical line; milestone items (start = end) render as diamonds; dependency arrows are an SVG overlay computed from `dependency` column values, display-only in V1, drag-to-reflow in V2 (01 §2.5).

**Calendar** — month/week/day grid keyed to a chosen `date`/`timeline` column; event pills are draggable (drop = optimistic `PATCH column-values`, rollback on 4xx); clicking an empty day opens the quick-create item modal pre-filled with that date.

---

## 6. Inline Editing & Drag-and-Drop

### Inline editing (per column type)

| Type | Interaction |
|---|---|
| `text` / `number` | Click → input in place. `Enter` commits + moves focus down; `Tab` commits + moves right; `Esc` cancels. Matches the "spreadsheet-fast" requirement (01 §2.1) |
| `status` / `dropdown` | Click → searchable popover of labels/options; selecting commits and closes immediately (the signature colored-chip interaction, 01 §2.2) |
| `person` | Click → member-search popover with checkboxes; avatars render optimistically before the request resolves |
| `date` | Click → calendar popover; also accepts typed shorthand (`today`, `+3d`, `next mon`) parsed client-side before falling back to the picker |
| `checkbox` | Single click toggles — no popover |
| `long_text` | Click expands an inline textarea (not a full modal, to keep flow) |
| `file` | Click opens an upload dropzone popover, wired to the 3-step upload flow (04 §3.7) |

**Every cell edit is an optimistic TanStack Query mutation**: the UI updates instantly, the `PATCH /items/{id}/column-values` request fires in the background, and on failure the previous cached value is restored with a toast — this is what makes the sub-100ms interaction budget (01 §1.1 pillar 2) achievable despite a real network round trip.

### Drag-and-drop (dnd-kit, keyboard-accessible throughout)

| Draggable | Effect | Persistence |
|---|---|---|
| Item row handle | Reorder within group, or drag into another group | Recomputes one `position` LexoRank string (02 §0) — never a bulk reindex |
| Kanban card | Drag to another lane | Updates the stacked column's value + position |
| Group header | Reorder groups | `position` rank update |
| Column header | Reorder columns | `position` rank update |
| Gantt bar edge | Resize → changes start or end date | `PATCH column-values` on the `timeline` column |
| Gantt bar body | Shift both dates together | Same, both fields |
| Dashboard widget | Move / resize on the grid | Debounced `PATCH widgets/{id}` `{layout: {x,y,w,h}}` |

The automation builder is deliberately **not** drag-based (§10) — pillar 3 (01 §1.1) treats automations as something to read and reason about, not assemble spatially like a flowchart, which is a common source of "why did this fire" confusion in competitor tools.

---

## 7. Customizable Columns

`+ Add column` opens a type picker (the 24 types from 01 §2.2, grouped: Basic, Advanced, Formula/Connect for V2), then a settings panel scoped to that type (e.g., `status` → label list editor with color swatches and a drag-to-reorder label list, max 20; `number` → format/decimals/aggregate). Existing columns: click the header caret → **Edit column** (same settings panel), **Duplicate**, **Delete** (soft, 30-day value retention per 02 §3.2), or **Hide** (view-local, doesn't affect other users' views). Column type changes are blocked in the UI beyond `text → long_text` widening, with an explanatory tooltip rather than a silent no-op — matching the backend constraint (04 §2.4).

---

## 8. Dashboard Builder

A responsive 12-column grid canvas (`react-grid-layout`-style behavior via dnd-kit + resize handles). `+ Add widget` opens a gallery of the 6 MVP widget types (Counter, Chart, Battery, Timeline, To-do, Text — 01 §2.4); each placed widget gets a gear icon opening its config panel (choose up to 20 source boards, a column to aggregate, chart type, filters — mirrors `widgets.config`, 02 §7.2). Layout changes (drag/resize) autosave debounced 500 ms. Widgets fetch data scoped to **the viewing user's own permissions** (03 §4) — two people looking at the same dashboard can legitimately see different totals if their board access differs, and the UI surfaces this with a small "showing boards you have access to" note rather than pretending the numbers are universal. From V1, each widget can show a one-line **AI insight** underneath it (e.g., *"Completion rate dropped 15% this week, driven by the Acme board"*) — narration computed over that same already-fetched, already-permission-filtered data, never a separate query (09 §3.8).

---

## 9. Automation Builder

`+ Add automation` on a board opens a choice: browse the **curated recipe library** (~25 recipes, categorized and searchable, doc 05 §2–§8) for one-click enable, or **Create custom**, which is a linear three-step form — never a free-form canvas (§6). AI-suggested recipes (09 §3.4), generated from the board's own event history, appear pinned at the top of the library, pre-filled — accepting one still requires the same explicit enable step as any other recipe, never an auto-enable:

1. **When** — trigger-type picker organized by doc 05's categories (Status change, Date-based, Assignment, Schedule, Form, Integration…), then the trigger's specific config fields.
2. **If** *(optional)* — up to 3 condition rows, each a column + comparator + value picker identical to the filter builder (§4 toolbar) — one widget reused in two places.
3. **Then** — one action (V1) with its config fields; V2 adds an ordered list with `+ Add another action` up to 5.

A live sentence banner at the top ("When **Status** changes to **Client review**, notify **Board owner**") updates as each field is filled — this *is* the recipe, not a preview of it. On save, the user is offered **Preview last 7 days** (calls the dry-run endpoint, 04 §3.8) before the toggle is flipped on.

**Automation Activity tab** (`/b/{boardId}/automations`): a run list (doc 05 §10.7) with status icons, filterable by recipe and status, each row expandable into the trigger snapshot / condition results / action timeline. Recipes with `disabled_reason` show an inline banner (`quota_exceeded`, `repeated_failures`) with the one-click re-enable action described in doc 05 §9.

---

## 10. Template Gallery

`/templates`: a filterable grid of cards (cover color, name, category tag — Client Delivery, Marketing, Recruiting, Ops, Support), matching the starter set (01 §2.7). Clicking a card opens a preview modal showing the **read-only sample board** pre-filled with realistic example items (never empty — Stage 1 explicitly calls this out as a demo-quality bar). `Use this template` prompts for target workspace/folder, then instantiates via `POST /workspaces/{id}/boards {template_id}` (04 §2.4). A board's `⋯` menu offers `Save as template`, feeding the custom-template list at the top of the same gallery, scoped to the org.

---

## 11. Settings Pages

Information architecture mirrors the phased admin console (01 §2.8):

| Section | Scope | Contents |
|---|---|---|
| **Personal** (`/settings/*`) | the logged-in user | Profile & avatar, notification cadence/DND (§14), security (password, 2FA, active sessions) |
| **Organization** (`/org/settings/*`) | org admins | Members & roles, Teams, Workspaces list, **Guest overview** (every external person + what they can see — 01 §2.8's auditability requirement, rendered as a searchable table), API tokens, **Usage** (the fair-use meters from doc 05 §9), Integrations, Audit log (ENT-gated, shows an upsell-free "available once your org is on Enterprise readiness" note rather than a paywall, since there's no plan to buy) |
| **Board** (`/b/{id}/settings`) | board owners | Columns, Permissions (member list + levels, 01 §2.8), Share links, Automations (links to §10), Activity log |

No billing settings page exists — consistent with 01 §2.9, there is nothing to bill.

---

## 12. Responsive & Mobile Considerations

| Breakpoint | Layout |
|---|---|
| `< 768px` (mobile) | Sidebar collapses to a bottom tab bar: **Boards · My Work · Notifications · Search** (01 §2.9). Table view collapses to a stacked card list (name, status chip, assignee, due date). Kanban becomes a single visible lane with a lane-switcher dropdown instead of horizontal scroll. Item detail opens as a full-screen route, not a slide-over. Dashboard widgets stack single-column |
| `768–1279px` (tablet) | Sidebar becomes an overlay drawer (icon rail + slide-out); table/kanban render at desktop density but narrower; Gantt and dashboard-builder show a "rotate or use desktop for the full editing experience" nudge on genuinely dense interactions (bar-resize, multi-widget layout) rather than a broken cramped UI |
| `≥ 1280px` (desktop) | Full layout as specified in §3 |

The responsive web app **is** the MVP mobile experience (01 §2.9 — no native app until V2); PWA installability and push notifications ship in V1 via `vite-plugin-pwa`. The "My Work" screen (bucketed Today / This week / Later / Overdue across all boards) is designed mobile-first since it's the primary mobile home screen, then adapted up to desktop as a dense list.

---

*Next: [07-ux-flows.md](07-ux-flows.md) — step-by-step user journeys through the surfaces defined here.*
