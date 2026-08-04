# 11 — UI/UX Design System & Surface Redesign

| | |
|---|---|
| **Product** | Trellis |
| **Document** | UI/UX design language, surface-by-surface redesign, and build plan |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-15 |
| **Depends on** | [01](01-vision-and-scope.md), [06](06-frontend-architecture.md), [07](07-ux-flows.md), [08](08-roadmap.md), [09](09-differentiation-and-ai.md) |

This document is the **visual and interaction layer** on top of doc 06 (which fixes the tech stack and surface anatomy) and doc 07 (which fixes the user journeys). Where doc 06 says *what exists on the board screen*, this doc says *what it looks like, how it moves, and in what order to build it*. Every feature keeps its phase tag from doc 01; **nothing here changes scope** — an interaction being specified does not make it MVP.

> **Corrected assumptions.** This spec is grounded in the stack doc 06 §1 already chose, not the generic SaaS default: **Vite + React Router v7** (not Next.js), **Fastify + PostgreSQL** (not Supabase), **TanStack Query** for all server state, **Zustand** for transient UI state only (not Redux), **Tailwind v4 + Radix primitives copied shadcn-style into `packages/ui`**, **TanStack Table + Virtual**, **dnd-kit**, **Recharts**. Animation is **CSS-first** (transitions + `@starting-style` + dnd-kit transforms); a spring library (`motion`) is admitted only if a V1 surface proves to need physics — do not add it preemptively.

---

## A. UI/UX Design Vision

### A.1 Personality

Trellis should feel like **a bright, fast spreadsheet that grew up into a product** — monday.com's color and energy, Linear's speed and keyboard discipline, Notion's calm typography. Three adjectives every screen is tested against:

1. **Fast** — every interaction responds < 100 ms optimistically (01 §1.1 pillar 2). Nothing blocks on the network; spinners are a last resort, skeletons and optimistic writes are the norm.
2. **Colorful, not loud** — color always *means* something: status labels, group identity, people. Chrome (nav, headers, toolbars) stays quiet ink and slate so the user's data is the most colorful thing on screen.
3. **Confident** — generous whitespace, few borders (prefer background shifts and shadows to outlines), one accent color for actions. **No gradients in the interface** — see [design.md](../design.md) §3.5.

> **Superseded 2026-07-30.** The personality/identity layer now lives in **[design.md](../design.md)** (§1–2), which is the authority on palette, typography, layout concept, voice, and the signature element. A brief experiment in gradient chrome (2026-07-20) was reversed there — see design.md §11 for what was cut and why. This document remains the authority on **surface anatomy, component inventory/placement, and phase tags**.

### A.2 How it should feel

- Opening a board feels like opening a spreadsheet: **content is interactive immediately**, no "loading your workspace…" interstitials. Skeleton rows shimmer for ≤ 400 ms worst case.
- Changing a status feels **physical**: the chip fills the whole cell, the picker opens under the cursor, the new color lands instantly, a subtle 120 ms scale-pop confirms it.
- The chrome **disappears during work**: toolbars are 32 px quiet gray rows; the sidebar collapses; hover reveals affordances (drag handles, row checkboxes, TRL-ids) instead of showing them all the time.
- Team presence is ambient: cells briefly glow when a teammate edits them (§I.6), avatars stack in the board header — you *feel* the team without a "collaboration" tab.

### A.3 The one-line test

> If a screenshot of any Trellis screen were posted with the logo cropped out, it should read as "a modern, well-funded SaaS tool" — never "an internal admin panel."

---

## B. Main Layout Blueprint

### B.1 Frame anatomy (≥ 1280 px)

```
┌──────┬──────────────────────────────────────────────────────────────┐
│      │  ⌘K Search…                    🔔³   [+ New ▾]   (avatar) ▾  │ ← TopBar 48px
│  S   ├──────────────────────────────────────────────────────────────┤
│  i   │  Client Work ▸ Acme — Website Redesign                       │ ← Breadcrumb row
│  d   │  ────────────────────────────────────────────────────────    │   (board pages only)
│  e   │                                                              │
│  b   │                    Content area                              │
│  a   │                                                              │
│  r   │                                                              │
│ 248px│                                                              │
└──────┴──────────────────────────────────────────────────────────────┘
```

**Sidebar (248 px, collapsible to 56 px icon rail):**

| Zone | Contents | Notes |
|---|---|---|
| Brand row (56 px) | Logo mark + wordmark; collapse chevron on hover | Collapsed state shows mark only |
| Workspace switcher | Current workspace name + colored monogram square, `▾` opens a popover listing all workspaces (≤ 20, 01 §2.9) with a search field at 8+ | Switching swaps the tree below, not a page navigation |
| Pinned nav | **Home**, **My Work** (V1 route exists MVP as "assigned to me" filter shortcut), **Notifications** (bell + unread count badge), **Search** | Icons + labels; icon-only when collapsed |
| Workspace tree | Folders (V1) → boards; board rows show a small board glyph tinted with the board's `icon` color (01 §2.2 board fields) | Active board: `bg-blue-50 text-blue-700` pill; hover reveals a `⋯` menu (rename, duplicate, archive) and a drag handle (V1 reorder) |
| Secondary | **Dashboards** (V1), **Templates** | |
| Bottom pinned | `+ Invite teammates`, Settings gear, user block (avatar, name, org) | User block opens the profile menu |

**TopBar (48 px, white, `border-b neutral-200`):**

- **⌘K search field** — left-aligned, 320 px, looks like an input but is a button that opens the command palette (§I.4). Placeholder: "Search or jump to… ⌘K". Board-level FTS in MVP; global cross-workspace search is V1 — the palette says which scope it's searching.
- **Quick create `[+ New ▾]`** — primary-colored split button: default action = New item in the current board (or New board from Home); dropdown: Item, Board, Group, Workspace, *(V1: Automation, Dashboard, Form)*.
- **Notification bell** — badge caps at `9+`; click opens a 400 px right-anchored popover (not a route) with Unread/All tabs, each row = actor avatar + verb sentence + board chip + relative time; "Mark all read" in the header. Full page at `/notifications` for history.
- **Avatar menu** — Profile & settings, Theme (light/dark, V1), Keyboard shortcuts (`?`), Log out.

**Breadcrumb row** appears only on board-scoped pages: `Workspace ▸ (Folder ▸) Board`. Each crumb is a link; the board crumb is the inline-editable board name (doc 06 §4.1).

### B.2 Responsive behavior (aligns doc 06 §12)

| Breakpoint | Behavior |
|---|---|
| ≥ 1280 | Full frame as above |
| 768–1279 | Sidebar auto-collapses to the 56 px icon rail; hovering/tapping the rail slides the full sidebar over the content (scrim behind). Board toolbars wrap to two rows |
| < 768 | Sidebar becomes a bottom tab bar (Boards · My Work · Notifications · Search); TopBar keeps only ⌘K + avatar; table view → stacked cards; item panel → full-screen route |

Sidebar collapse state persists in `localStorage` and is a Zustand UI store, never server state.

### B.3 Home page (the `/` route, MVP)

Layout: single 1040 px-max column, three zones.

1. **Header** — date eyebrow (`Tuesday, July 15`), greeting `Good morning, {firstName} 👋`, subline showing org + workspace context.
2. **"Pick up where you left off"** — horizontal row of up to 4 **recent boards** (client-side `localStorage` MRU in MVP; server-side recents V1). Card: 220×92 px, gradient icon tile, board name, workspace caption, relative "opened 2h ago".
3. **Board grid** — all boards in the active workspace as cards (current implementation), plus the dashed **New board** card which opens inline-name → create → navigate.

V1 additions slot in *between* zones 2 and 3 without relayout: **My Work preview** (first 5 items assigned to me, bucketed Overdue/Today/This week — links to `/my-work`), **Activity feed** (right rail at ≥ 1440 px: teammate actions on boards I'm a member of), **AI card** (09 §3): a single quiet card — "Ask Trellis: *'what's overdue for Acme?'*" — that opens ⌘K in NL-search mode, **not** a chat window. Charts/progress summaries belong to Dashboards (§F), not Home — Home stays a launcher, < 1 s to leave.

**Empty states:** no workspace → centered create card (current implementation). Workspace with no boards → template gallery teaser: 3 template cards + "Start from scratch" (doc 07 §2 flow).

---

## C. Board Experience Redesign

The board screen is the product (doc 06 §4). Its redesign, layer by layer:

### C.1 Board header

- Row 1 (44 px): breadcrumb · inline-editable **board name** (click → borderless input, `Enter` commits, `Esc` cancels; 22 px semibold) · privacy glyph (lock = private board) · description affordance ("Add a description" ghost text; existing description truncates to one line, click to expand a popover) · right side: **member avatar stack** (≤ 5 + `+N`, click → member list popover), `Share` button *(V1 — hidden in MVP, no guests yet)*, `Automate ⚡` *(V1)*, `⋯` menu (duplicate, archive, save as template *(V1)*, CSV import/export **(MVP)**, board settings).
- Row 2: **view tabs** — `Table` `Kanban` `+` in MVP (`+` opens "New view: Table / Kanban", saved as a named view). Tabs are pills with the view-type glyph; active tab has a 2 px bottom accent bar. Tab overflow scrolls horizontally with fade masks. V1 adds Timeline/Gantt · Calendar · Form; V1 personal views live under a trailing `My views ▾`.

### C.2 Toolbar (36 px)

Left → right: `[+ New item]` (primary, splits per group when > 1 group) · quick-filter chips **Assigned to me** / **Due this week** / **Overdue** (toggle style: outline → filled blue) · `Filter ▾` (rule-builder popover: column + comparator + value rows, same widget as automation conditions per doc 06 §9) · `Sort ▾` · `Group by ▾` (V1 — MVP always groups by board groups) · `Hide ▾` (column visibility checklist, view-local) · search-within-board input (filters rows live, highlights matches) · right: item count · `⌘K` hint.

Active filter/sort state renders as **removable chips** in a second 28 px row that only exists while filters are active — the board never silently hides data.

### C.3 Table view — the flagship (MVP; detailed spec)

**Structure** (TanStack Table + Virtual once > 200 rows; plain map below that):

- **Sticky header** row (`position: sticky; top: 0; z-10`, white, `border-b`, 32 px): checkbox column (36 px) · **Item** column (min 280 px, sticky-left, `z-20` at the intersection) · data columns (default 140 px) · trailing `+` add-column header cell.
- **Column headers**: type glyph (13 px, neutral-400) + title; hover reveals a caret opening: Edit column *(rename + type-scoped settings)*, Sort by this, Hide, Duplicate *(V1)*, Delete (soft, confirm dialog citing 30-day retention). Header edges are **resize handles** (4 px hit area, `col-resize` cursor, live-drag with a 1 px guide line, debounced `PATCH columns/{id}` 400 ms). Header body is a **dnd-kit drag source** for column reorder — dragging lifts the whole column as a translucent overlay, drop targets show a 2 px blue insertion line.
- **Group sections**: sticky mini-header (colored chevron + group title in group color + count + collapse). Collapsed groups show a single summary row (count + status distribution bar — a 4 px horizontal stacked bar of label colors, delightful and free to compute). **Group footer** row shows per-column aggregates (number → sum, status → distribution bar, date → range) — MVP ships count only, aggregates V1.
- **Rows** (36 px, `hover:bg-neutral-50`): the group-color 3 px left edge; row **checkbox fades in on hover** (always visible once ≥ 1 selected); **drag handle** (⋮⋮) fades in at the far left (dnd-kit row reorder → one LexoRank `position` write, doc 06 §6); item name cell shows name + hover-revealed TRL-id chip + a hover **"open" ↗ affordance** that opens the item panel; a comment-count bubble renders after the name when > 0.
- **Bulk actions**: selecting rows floats a **pill-shaped action bar** bottom-center (`shadow-lg`, slides up 160 ms): `N selected · Set status ▾ · Assign ▾ · Move to group ▾ · Archive · ✕`. Batch limit 500 (04 §3.5).
- **New row**: each group ends with the ghost `+ Add item` row (current implementation). On create, the optimistic row **animates in** (`@starting-style` height/opacity, 160 ms) with the name already committed; focus stays in the ghost input for rapid entry.
- **Empty board**: friendly panel — "This board is empty. Add your first item below, or ⌘K to import from CSV." with a sample-row illustration.
- **Loading**: 8 skeleton rows per group (shimmering 36 px bars at 60/12/12/8% widths), never a spinner.

### C.4 Cell editors (per type — extends doc 06 §6 with visuals)

| Type | Resting | Editing |
|---|---|---|
| `status` | Full-cell chip, label color bg, white 12 px medium text, centered | Click → Radix Popover under the cell: label rows as full-width colored chips, current one checked; searchable at > 8 labels; footer "Edit labels" (owners). Selection commits instantly; cell pops 1.0→1.06→1.0 (120 ms) |
| `text` | Left-aligned 14 px, truncate | Click → in-place borderless input, blue 2 px focus ring *inside* the cell. `Enter` ↓, `Tab` →, `Esc` cancels |
| `long_text` | First line truncated + expand glyph on hover | Click → cell grows to a 3-row textarea overlay (`shadow-md`, still anchored to the cell) |
| `number` | Right-aligned, tabular-nums | In-place input; invalid input shakes 4 px ×2 and keeps focus |
| `person` | Avatar(s) 22 px + first name; empty = ghost person glyph | Click → member search popover, checkbox multi-select, avatars land optimistically |
| `date` | `Jul 24` (year only if ≠ current); **red text + dot when overdue** and item not in a done status | Click → calendar popover + free-text field parsing `today`, `+3d`, `next mon` |
| `dropdown` | Neutral-100 rounded-full chip per option | Same popover pattern as status, gray chips |
| `checkbox` | Centered 16 px | Single click toggles; check draws in 120 ms (SVG stroke-dashoffset) |

All edits are optimistic TanStack Query mutations with rollback + toast on failure (doc 06 §6). A **failed cell** flashes red bg 300 ms as it reverts.

### C.5 Kanban view (MVP)

- Lanes from the `stack_by_column_id` status/dropdown/person column (board setting, default = first status column). Lane header: label-colored 3 px top edge, label name, count badge (red when > `wip_limit`, V1 setting), `+` quick-add, collapse chevron (collapsed lane = 40 px vertical strip with rotated title + count).
- **Cards** (white, `radius-lg`, `shadow-xs`, `hover:shadow-md` + 1 px lift, 8 px padding): item name (2-line clamp) · up to 6 configured column chips (status chips render as small dots + text here to avoid rainbow overload) · footer: avatar stack + due-date chip (red if overdue) + comment bubble.
- **Drag**: dnd-kit — lifted card tilts 3°, scales 1.03, casts `shadow-lg`; lane drop targets show a placeholder slot of the card's height; drop = optimistic status + position write. Keyboard: space lifts, arrows move, space drops (dnd-kit sensors).
- `+ Add task` at lane bottom opens an inline card-shaped input.
- Empty lane: dashed slot — "Drag items here or **+ add one**".

### C.6 Item detail panel (MVP core; the "command center")

**Slide-over from the right** (Radix Dialog, non-modal so the board stays interactive underneath at ≥ 1280 px), 520 px (640 px at ≥ 1536 px), 240 ms ease-out slide + fade, board dims 8%. Route-synced (`?item={id}`) so refresh/deep-links restore it. `Esc` or scrim-click closes and **returns focus to the originating row**. `↑/↓` (or `j/k`) while open moves to prev/next item — triage mode.

Layout:

1. **Header**: TRL-id chip · inline-editable title (18 px semibold) · close ✕ · `⋯` (archive, copy link, duplicate).
2. **Key facts strip** — the same cell editors as the table, laid as labeled fields in a 2-col grid: Status, Person, Date, then remaining columns. Same components, same optimistic writes (`BoardCell` reused, §H).
3. **Tabs**: **Updates** (default) · **Files** *(V1 — file column is V1)* · **Activity**.
   - **Updates**: TipTap composer (placeholder "Write an update… @ to mention"), `@mention` typeahead (MVP — drives notifications), comment cards with avatar/name/time, hover actions (react 👍, edit, delete own). **Summarize ✨** button appears once a thread exceeds ~10 replies (09 §3.6, MVP AI): renders an inline summary card at top labeled "AI summary — may be imperfect", with 👍/👎 feedback and a "based on N comments" caption.
   - **Activity**: append-only log — actor avatar + sentence ("**Maria** changed **Status** from ~~Working on it~~ to **Done**") with old→new chips, grouped by day.
4. Future slots (V1/V2, designed but not built): Subitems tab, Dependencies block, Time tracking, Related items — the panel's tab bar and facts grid absorb these without relayout.

### C.7 Templates & empty states (MVP set per 01 §2.7)

Template gallery (`/templates`, browse-only in MVP): filterable card grid — cover color band, template name, category tag, "includes: N columns · M groups · sample items" caption. Click → preview modal rendering the **actual sample board read-only** (never a static screenshot), `Use template` → workspace picker → instantiate.

The 6 MVP starters and their cover colors: **Client Project Delivery** (blue), **Creative Request Intake** (violet), **Content Calendar** (amber), **Simple Sprint** (teal), **Client Onboarding** (green), **Bug/Issue Tracker** (red). These already cover the classic asks (bug tracking, content planning, client work); marketing/CRM/event/HR/recruiting arrive with the V1 set (01 §2.7).

**Empty-state copy standard**: every empty state = illustration (single-color line art, 96 px) + one-line headline (what this place is) + one-line body (what to do) + one primary action + optional secondary "Learn" link. Never a bare "No data".

---

## D. Automation Builder Design (V1 — design now, build in V1)

Doc 06 §9 fixes the interaction model: **linear sentence builder, never a node canvas**. The visual layer:

- **Entry**: board header `Automate ⚡` → full-height right panel (720 px) with two tabs: **Recipes** and **Active** (N).
- **Recipe library**: searchable card grid; each card is the recipe *sentence* with the variable parts pre-highlighted as colored chips ("When **status** changes to **something**, **notify** someone"), a category tag, and a use-count. AI-suggested recipes (09 §3.4) pin on top with a ✨ badge and one line of why ("You move items to *Done* and then archive them 3–4× a week").
- **Builder**: the recipe sentence renders 24 px at the top and **is the state** — each chip is a dropdown; unfilled chips pulse a soft blue underline. Below, three numbered collapsible sections (When / If (optional) / Then) with the detailed pickers. Footer: `Preview last 7 days` (dry-run table: would-have-fired rows with timestamps) · `Create automation` (disabled until sentence completes).
- **Active list**: each automation = a card with the sentence, an enable **Switch**, run stats ("142 runs · last 2h ago"), and a red banner when `disabled_reason` is set ("Paused after repeated failures — **View runs · Re-enable**").
- **Run history**: table of runs (status dot ✓/✕/⏭, trigger snapshot, expandable row → condition results + action timeline). Failed runs get a red left edge.
- **Empty state**: "Automations do the boring parts. Start with a popular recipe:" + the 3 most-used recipe cards inline — never a blank canvas.

---

## E. AI Assistant Design

Governing principle (09 §2): AI is **woven into surfaces, previewed before commit, never auto-applied**. There is deliberately **no floating chat bubble** — that pattern is the "bolted-on widget" doc 01 rejects. AI shows up in five escalating ways:

| Surface | Phase | Design |
|---|---|---|
| **NL search in ⌘K** | MVP | Typing a sentence ("things I'm behind on for Acme") shows a ✨ row: "Filter: assignee=me · due<today · board=Acme" — pressing Enter *applies it as a normal filter chipset* the user can see and remove. AI output = filters, not answers |
| **Thread summarization** | MVP | §C.6 — inline card in Updates, clearly labeled, feedback buttons |
| **Task generation** | V1 | In the `+ New item` ghost row, typing `✨` or clicking the spark icon: "Describe the work…" → AI returns **draft rows rendered in-table with a dashed border + ✨ badge**, each with Accept / Edit / Discard; Accept-all in a floating bar. Drafts never persist unaccepted |
| **Automation suggestions** | V1 | §D — pinned pre-filled recipes, standard enable flow |
| **Dashboard insights** | V1 | one-line narration under each widget (doc 06 §8), with a "why?" hover exposing the underlying numbers |
| **Assistant panel** | V2/ENT | Only at this phase does a conversational panel appear (09 §3.10): right slide-over, suggestion chips ("What changed this week?", "What should I do next?"), every actionable answer rendered as **preview cards with explicit Apply buttons**. Same panel chassis as the item panel (§H) |

**Visual language for AI** *(revised 2026-07-30 — see [design.md](../design.md) §3.5)*: AI-origin affordances carry **no dedicated hue**. The former violet `#7C5CFC` accent is withdrawn — a seventh interface hue on a screen already rendering twenty user-chosen label colors reduces legibility. Provisional-ness is signalled by **form**: a 1px dashed `indigo` border, a spark glyph, and a mono `AI` label, until accepted. Every AI output has 👍/👎 (feeds `ai_interactions`, 02 §6.6). No skeuomorphic "robot" iconography, no typing indicators pretending to be a person.

---

## F. Dashboard Design (V1 — design now, build in V1)

Doc 06 §8 fixes mechanics (12-col grid, 6 widget types, permission-scoped data). Visual layer:

- **Canvas**: `#f6f7fb` background; widgets are white `radius-xl` cards with `shadow-xs`, 16 px padding, drag handle = header row, resize = bottom-right corner grip (visible on hover). Dragging shows a blue dashed target slot; other widgets animate to make room (CSS grid transitions, 180 ms).
- **Widget anatomy**: header (title, source-board count caption, gear → config side panel, ⋯ menu) · body (chart/number) · footer (AI insight line, V1 — ✨ + one sentence).
- **The 6 widgets** (01 §2.4): **Counter** (48 px tabular number + delta arrow + label) · **Chart** (Recharts bar/line/pie themed to the token palette, §G) · **Battery** (visx horizontal stacked status bar with % done) · **Timeline** (mini-Gantt strip) · **To-do** (checklist of items assigned to viewer) · **Text** (TipTap block for narrative).
- **Config panel**: right slide-over (reuses panel chassis): boards multi-select (≤ 20) → column → aggregation → filters (same rule builder again).
- **Empty dashboard**: centered "Add your first widget" + 4 template layouts (Project overview, Team workload, Client status report, Sprint health) that pre-place configured widgets.
- Charts use the **categorical ramp** from §G only; never per-widget random colors. Numbers use `tabular-nums` everywhere.

---

## G. Design System (tokens → `packages/ui`)

> **Superseded 2026-07-30 — see [design.md](../design.md).** Color (§3), typography (§4), spacing/radius/elevation (§5.2), and the signature status fill (§10) are now specified there and implemented in `packages/ui/src/tokens.css`. The values that used to live in this section (`#2563EB` brand, Inter, the `#f6f7fb` canvas, the `#7C5CFC` AI accent, neon status defaults) were **replaced**, not merely restyled — design.md §11 records each cut and why. Do not re-derive tokens from this section.
>
> Two things below remain in force and are **not** superseded, because they are user-content rules rather than identity choices:
>
> **The 20-label palette** (01 §2.2 — status/dropdown labels, group presets, entity monograms), which stays exactly as authored:
>
> | | | | | |
> |---|---|---|---|---|
> | Green `#00C875` | Bright green `#9CD326` | Teal `#00A9B8` | Cyan `#66CCFF` | Blue `#579BFC` |
> | Dark blue `#0073EA` | Indigo `#5559DF` | Purple `#A25DDC` | Berry `#7E3B8A` | Pink `#FF5AC4` |
> | Rose `#FF7575` | Red `#E2445C` | Dark red `#BB3354` | Orange `#FF642E` | Amber `#FDAB3D` |
> | Yellow `#FFCB00` | Lime `#CAB641` | Brown `#7F5347` | Gray `#C4C4C4` | Dark gray `#808080` |
>
> **`labelTextColor(hex)`** — chip text is computed from relative luminance, never eyeballed (design.md §3.5).

Tokens live as **Tailwind v4 `@theme` CSS variables** in `packages/ui/src/tokens.css`, consumed by both apps. Dark theme (V1) overrides the same variables under `[data-theme="dark"]` — components never hard-code hexes.

### G.4 Core component specs (`packages/ui`)

| Component | Spec |
|---|---|
| **Button** | Variants: primary (brand bg) / outline / ghost / danger; sizes sm 32 / md 36; icon-only square variant; loading state swaps label for a 14 px spinner keeping width (no layout shift) |
| **Input / Textarea** | 32/36 px, `radius-sm`, border neutral-300 → brand-400 + ring on focus; error state red border + 12 px message below; left-icon slot |
| **StatusChip** | The signature component: full-width table variant, compact dot+text variant (kanban/cards), `labelTextColor` applied |
| **Avatar / AvatarStack** | 22/28/32 px, initials on deterministic entity color, image when set; stack overlaps −8 px with 2 px white ring, `+N` overflow |
| **Badge** | 12 px, `radius-full`, tinted bg (10% of its color) + solid text — used for counts, phases, TRL-ids |
| **Popover / DropdownMenu / Tooltip / Dialog / Toast** | Radix primitives styled to tokens; Toast: bottom-left, white, `shadow-lg`, status edge bar, auto-dismiss 5 s, action slot ("Undo"), stacks max 3 |
| **Modal** | `radius-xl`, `shadow-lg`, max 480/640/960 px tiers, scrim `neutral-900/40`, enters scale .97→1 + fade 180 ms |
| **EmptyState / Skeleton** | Per §C.7 standard; Skeleton: `neutral-200/60` bars, 1.6 s shimmer, shaped per real layout (never generic boxes) |
| **DatePickerPopover, PersonPicker, SearchableSelect** | Composed pickers backing the cell editors — built once, reused in table, kanban, item panel, filter builder, automation builder |

**Error states**: field-level inline; page-level = EmptyState variant with a red illustration + "Try again" retry button wired to the query's `refetch`; global network loss = amber top banner "Reconnecting… changes will sync" (real-time resume per doc 03 §5).

**Iconography**: current hand-drawn set (24 px grid, 2 px stroke, round caps) is the interim standard; swap to **Lucide** (same geometry) when `packages/ui` lands so we stop drawing by hand. One icon size rule: 16 px in controls, 14 px in table headers, 20 px in nav.

---

## H. Component Architecture

### H.1 Inventory and placement (extends doc 06 §2)

| Component | Package / feature | Phase | Notes (what exists today → target) |
|---|---|---|---|
| `AppShell`, `Sidebar`, `TopBar`, `Breadcrumbs` | `apps/web/src/app/` | MVP | Today's `AppShell.tsx` splits: sidebar gains switcher + tree; TopBar is new |
| `WorkspaceSwitcher`, `CommandMenu` | `features/search/` | MVP | CommandMenu = Radix Dialog + `cmdk`-style list; NL-search row per §E |
| `NotificationBell`, `NotificationCenter` | `features/notifications/` | MVP | |
| `BoardHeader`, `ViewTabs`, `BoardToolbar`, `FilterBuilder` | `features/boards/` | MVP | FilterBuilder is the shared rule widget (filters + automations) |
| `DataGrid`, `BoardGroup`, `BoardRow`, `BulkActionBar` | `features/views/table/` | MVP | Today's `BoardPage` table decomposes here; TanStack Table+Virtual arrives with this refactor |
| `BoardCell` + `StatusCell`, `PersonCell`, `DateCell`, `TextCell`, `NumberCell`, `CheckboxCell`, `DropdownCell`, `LongTextCell` | `features/items/cells/` | MVP | Today's `Cell` switch splits per type; each = resting renderer + editor popover; **reused verbatim in the item panel facts grid** |
| `KanbanBoard`, `KanbanColumn`, `KanbanCard` | `features/views/kanban/` | MVP | |
| `ItemPanel` (+ `UpdatesTab`, `ActivityTab`, `CommentComposer`, `AiSummaryCard`) | `features/items/` | MVP | |
| `TemplateGallery`, `TemplatePreviewModal` | `features/templates/` | MVP (browse) | |
| `CsvImportWizard` | `features/boards/` | MVP | 3 steps: upload → column mapping table → preview/commit |
| `InviteMemberModal`, member admin | `features/settings/` | MVP | |
| `AutomationPanel`, `RecipeCard`, `SentenceBuilder`, `RunHistory` | `features/automations/` | **V1 — do not scaffold yet** | |
| `DashboardCanvas`, `Widget*`, `WidgetConfigPanel` | `features/dashboards/` | **V1 — do not scaffold yet** | |
| `AiDraftRow`, `AiAssistantPanel` | `features/ai/` | V1 / V2 | |
| Primitives (Button, Input, StatusChip, Avatar, Badge, Popover, Dialog, Toast, Tooltip, EmptyState, Skeleton, pickers) | **`packages/ui`** | MVP | Graduate today's `apps/web/src/components/ui.tsx` + `icons.tsx` here as the first real content of the package |

### H.2 State rules (restating doc 06 §2 — these are load-bearing)

- **Server data**: TanStack Query only. Query keys are already centralized (`lib/queries.ts`) — keep one key factory per entity; every mutation invalidates by prefix or patches the cache optimistically.
- **Optimistic pattern** (all cell edits, drags, toggles): `onMutate` snapshot → cache write → `onError` restore + toast → `onSettled` invalidate. Ship one `useOptimisticColumnValue` hook so 8 cell types don't reimplement it.
- **Zustand** stores (transient only): `uiStore` (sidebar collapsed, active modal), `selectionStore` (selected row ids, per board), `editingStore` (which cell is open — exactly one), `panelStore` (item panel id — mirrored to `?item=` search param).
- **Real-time** (MVP sprints 5–6): socket.io deltas write into the same Query cache (`setQueryData`), tagged with `actorId` to trigger the remote-edit glow (§I.6) and suppress self-echo.
- **Drag-and-drop**: one `dnd-kit` `DndContext` per surface; all reorders compute a LexoRank `position` between neighbors client-side and fire one PATCH — never reindex siblings.
- **Accessibility floor**: every popover/dialog is a Radix primitive (focus trap + restore free); the grid uses `role="grid"`/`row`/`gridcell` with roving tabindex and arrow-key navigation; drag has keyboard sensors; all color pairs pass 4.5:1 (§G.1 `labelTextColor`); `prefers-reduced-motion` disables all non-essential animation (§I.7); toasts are `aria-live="polite"`.

---

## I. Interaction & Animation Plan

**Timing system** — three durations, two easings, applied everywhere: `fast 120ms` (hover, chip pop, checkbox) · `base 180ms` (popovers, dropdowns, row insert) · `slow 240ms` (panels, modals, page transitions); `ease-out` for entering, `ease-in-out` for moving. Nothing animates longer than 300 ms except confetti.

1. **Hover**: rows tint `neutral-50`; cards lift 1 px + `shadow-md`; buttons darken one step; affordances (drag handles, checkboxes, TRL-ids, column carets) fade in 120 ms — hover *reveals*, it never *moves* layout.
2. **Focus**: the two-layer ring (§G.3) on every interactive element; in-grid focus = ring inside the cell; visible keyboard path through the entire board (grid roving tabindex).
3. **Drag**: lift = scale 1.03 + tilt (cards) + `shadow-lg` + source ghost at 40% opacity; drop targets = 2 px blue insertion line (rows/columns) or dashed slot (kanban/dashboard); drop settles with a 180 ms transform to rest — no bounce.
4. **Command palette (⌘K)**: center-top modal, 640 px, opens in 120 ms; sections: Jump to board · Items (FTS) · Actions ("New item", "Toggle sidebar") · ✨ NL-filter row. `↑↓` navigate, `Enter` runs, `Tab` completes.
5. **Keyboard shortcuts** (MVP set): `⌘K` palette · `Esc` close/cancel · `Enter/Tab` commit-and-move in cells · `j/k` or `↑↓` item panel prev/next · `c` new item in focused group · `?` shortcut sheet (modal listing all, auto-generated from the registry).
6. **Real-time presence**: teammate edits pulse the cell with a 2 px ring in the *actor's* entity color fading over 1.5 s; board header avatar stack shows live viewers with a green dot; comment tab shows "Maria is typing…" (V1).
7. **Celebration — cut 2026-07-30** ([design.md](../design.md) §7). The confetti burst on completion is removed, not kept-and-disabled: it is decoration the workflow doesn't earn, and it fires mid-client-screen-share. What remains is informational — the status fill animates its width 120 ms to the new length, which is the one animation in the product that carries meaning.
8. **Toasts**: bottom-left, every destructive action gets an **Undo** action slot (archive item/group, delete column) wired to the soft-delete window — undo is the primary error-recovery path, confirmation dialogs are reserved for the genuinely irreversible.

---

## J. Implementation Roadmap

Maps to doc 08's sprint plan; the walking skeleton built July 2026 is the seed of Sprint 3–4's deliverables.

**Now → next 2 sprints (MVP hardening, doc 08 sprints 3–4 equivalents):**
1. **Graduate the kit**: move `components/ui.tsx` + `icons.tsx` into `packages/ui` with the §G tokens (`tokens.css`); swap icons to Lucide; add StatusChip, Badge, Toast, Skeleton, EmptyState, Popover/Dialog on Radix.
2. **Shell v2**: TopBar (⌘K button, quick-create, bell placeholder, avatar menu), collapsible sidebar, workspace switcher popover, breadcrumbs.
3. **Table v2**: decompose `BoardPage` per §H.1; TanStack Table + Virtual; sticky header/first column; column resize/reorder; row drag; selection + bulk bar; per-type editor popovers (status popover replaces the current menu, date popover, person picker against org members).
4. **Item panel**: slide-over with facts grid (reused cells) + Updates (TipTap composer, mentions) + Activity — requires the comments/activity APIs (backend sprint 5–6 pairing).
5. **Kanban** on dnd-kit + view tabs + saved views.

**MVP completion (sprints 5–8):** notifications bell + center · ⌘K palette with FTS then NL-search row · thread summarization card · template gallery · CSV import wizard · responsive card-list mode + bottom tabs · real-time glow + presence · empty/loading/error states everywhere · Playwright coverage of drag, edit, panel flows.

**V1:** dark theme (token swap) · automation panel (§D) · dashboards (§F) · Timeline/Gantt + Calendar views · My Work · file cells + Files tab · guests/share modal · AI task generation + automation suggestions + widget insights.

**V2/ENT:** AI assistant panel · dependency drag-to-reflow · workspace templates · white-label client-portal theming (token overrides per share link).

---

## K. MVP UI Scope — the hard boundary

Build **only** (per 01 §3.2 + CLAUDE.md): app shell + Home · Table + Kanban views · 8 column types with the §C.4 editors · groups · item panel with Updates (mentions) + Activity + AI thread summary · filters/sort/saved views · board-level ⌘K search + NL-search · notifications (in-app + email) · template gallery (6 starters, browse) · CSV import/export · basic admin/settings · responsive mobile web · auth screens.

Explicitly **not now**, even though designed above: Calendar/Timeline/Gantt (§C tabs render only Table/Kanban), automations (§D), dashboards (§F), AI beyond the two MVP features (§E), subitems/dependencies/time-tracking blocks in the item panel, Share/guest UI, forms, folders, teams, global search. When a surface above says V1/V2, the MVP UI ships **no dead buttons** for it — absent, not disabled.

## L. Advanced UI Features for Later

Parking lot with owners-when-scheduled: multi-cell range selection + copy/paste grid (V2) · column formulas + mirror columns UI (V2) · board-level undo history panel (V1 investigation) · presence cursors in long-text cells (V2) · per-user board color themes (never — brand consistency wins) · native drag-out of files (V2) · offline PWA queue (V1 with vite-plugin-pwa) · AI assistant panel GA (ENT gate per 09 §3.10).

---

*Relates to: [06-frontend-architecture.md](06-frontend-architecture.md) (structure & stack), [07-ux-flows.md](07-ux-flows.md) (journeys), [08-roadmap.md](08-roadmap.md) (sequencing).*
