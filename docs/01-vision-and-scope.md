# 01 — Vision & Scope

| | |
|---|---|
| **Product (working name)** | Trellis |
| **Document** | Stage 1 of 4 — Vision & Scope |
| **Status** | Draft v1.2 — AI made a core pillar, not a deferred non-goal (2026-07-10) |
| **Date** | 2026-07-10 |
| **Audience** | PM, design, engineering |

---

## 1. Product Vision

### 1.1 Core Vision

**One-liner:** Trellis is the AI-assisted work operating system for client-facing teams — plan work, run it, and show it to clients without ever exporting a spreadsheet.

Trellis is a flexible work-management platform in the monday.com mold: colorful boards, custom columns, multiple views, automations, and dashboards — with AI woven into the workflows themselves rather than bolted on as a chat widget. But where monday.com is a horizontal "Work OS" for everyone, Trellis is opinionated about one underserved job: **teams whose work is ultimately delivered to someone outside the company** — agencies, consultancies, studios, professional-services firms, and any internal team that serves demanding stakeholders.

Four product pillars define every roadmap decision:

| Pillar | What it means concretely | Example commitment |
|---|---|---|
| **1. Client-grade by default** | Sharing with an outsider is a first-class flow, not a permissions hack. Every board can produce a polished, scoped, read-only or comment-enabled client view in two clicks. | "Share with client" button on every board header; client sees only whitelisted columns; no Trellis chrome/upsells in client view. |
| **2. Fast and keyboard-first** | Sub-100ms perceived interactions, full command palette (`Ctrl/⌘+K`), every core action keyboard-reachable. Speed is a feature we market. | Creating an item, changing a status, and navigating boards never shows a spinner. p95 interaction latency budget: 100ms UI response, 300ms server round-trip. |
| **3. Transparent automations** | Automations are debuggable, not magic. Every run is logged with inputs, outputs, and failures; users can dry-run a recipe before enabling it. | An "Automation activity" tab shows: *"Run #4,812 — 'When Status → Done, notify creator' — succeeded, 09:14, triggered by item #1042."* |
| **4. AI-native, not AI-bolted-on** | AI is woven into workflows a user already relies on — search, drafting items, catching up on a thread — not a separate chatbot nobody opens. Every AI action is a suggestion until a human confirms it; a confirmed one is indistinguishable from a manual action in the activity log. | Typing "things Priya is behind on" into search returns real, permission-correct results; summarizing a 40-reply client thread is one click in the item panel. Full design in [09-differentiation-and-ai.md](09-differentiation-and-ai.md). |

**What Trellis is not:** a chat app, a docs editor, a whiteboard tool, a full CRM, a developer-grade issue tracker, or a general-purpose AI chatbot in a sidebar. We integrate with the winners in those categories instead of rebuilding them, and AI lives inside existing workflows rather than as a separate destination.

### 1.2 Target Users & Main Use Cases

**Primary market:** teams of 10–200 people at service businesses and SMBs. **Adoption:** bottom-up via team leads / ops leads / agency producers. The product is free for now (see §2.9) — the goal of this era is adoption and the external-collaborator network, not revenue.

#### Personas

| Persona | Profile | Jobs to be done | What wins them |
|---|---|---|---|
| **Priya — Agency Producer** (primary) | 34, digital agency, 45 staff, runs 12 client retainers | Track deliverables per client, keep clients informed without status-call overhead, balance designer workload | Client portals, workload view, templates per client engagement |
| **Marcus — Ops Lead at an SMB** | 41, 80-person e-commerce company | Standardize intake (requests via forms), automate handoffs between teams, report to founders | Forms, automations, cross-board dashboards |
| **Dana — Marketing Manager** | 29, in-house team of 8 | Content calendar, campaign launches, approvals from brand/legal stakeholders | Calendar view, status workflows, guest reviewers |
| **Leo — Studio Owner / Freelancer collective** | 3–10 people | Lightweight project tracking that looks professional to clients | Free product, polished client share links |
| **The Client** (secondary — never pays, must love it) | Stakeholder at Priya's client | See progress, comment on deliverables, approve work — without creating an account or learning a tool | Zero-friction guest access, clean read-only views, email notifications |

#### Top use cases (ranked by importance to the wedge)

1. **Client project delivery** — agency runs a retainer or fixed-scope project on a board; client has a live portal view. Success metric: % of boards shared externally.
2. **Request intake** — form → board pipeline (creative requests, IT tickets, change orders).
3. **Content/campaign calendar** — marketing plans on calendar + kanban views with approval statuses.
4. **Lightweight sprints for non-engineering teams** — weekly cycles with groups-as-sprints.
5. **Resource planning** — who is over/under capacity this week (workload view).
6. **Exec/client reporting** — dashboards aggregating many boards into one page.

### 1.3 Competitive Positioning vs. monday.com

| Dimension | monday.com | Trellis strategy |
|---|---|---|
| Breadth | Horizontal Work OS + verticals (CRM, dev, service) | Deliberately narrower: work management only, best-in-class for external collaboration |
| Client/guest access | Guests limited to "shareable boards," billed 4:1, clunky setup | Client portals as a headline feature: scoped column visibility, no-account comment access via magic link, branded views |
| Speed / UX density | Feature-rich but heavy; noticeable latency on large boards | Performance budget enforced in CI; keyboard-first; 20,000-item boards stay smooth via virtualized rendering |
| Automations | Huge recipe library; opaque failures | Smaller curated library (launch: ~25 recipes) but with run history, dry-run, and failure alerts — "automations you can trust" |
| AI assistance | Scattered add-ons — a chat widget, an occasional autofill | Built into the workflows themselves from MVP: natural-language search, drafting items, thread summaries — always suggest-then-confirm, never a silent write (§2.10, doc 09) |
| Pricing | Per-seat, minimum 3 seats, guests semi-billed | **Free for now** — no seat pricing, no billed guests; monetization deferred until the network is proven (§2.9) |
| Templates | Massive marketplace | Curated set of ~12 opinionated templates at launch, each with a filled-in example board, focused on service businesses |
| Where we don't fight | Enterprise portfolio management, dev issue tracking, CRM product | Integrate (GitHub, HubSpot) rather than build; revisit post-V2 |

**Moat over time:** the external-collaborator graph. Every client invited to a portal is a future buyer who has already used Trellis. Viral loop: client of an agency becomes a team lead who brings Trellis to their own company.

---

## 2. Complete Feature Breakdown

### 2.0 Feature → Phase Map

Phases are defined in §3. "MVP" = free beta; "V1" = paid public launch; "V2" = scale; "ENT" = enterprise tier.

| # | Feature | Introduced | Notes |
|---|---|---|---|
| 1 | Workspaces | MVP | Single workspace per account in MVP; multiple in V1 |
| 2 | Boards | MVP | |
| 3 | Folders | V1 | Flat board list is fine for MVP |
| 4 | Groups | MVP | |
| 5 | Items | MVP | |
| 6 | Subitems | V1 | |
| 7 | Columns / custom fields | MVP (8 types) | V1: 17 types; V2: 24 types |
| 8 | Status tracking | MVP | Custom labels + colors from day one |
| 9 | Table/grid view | MVP | Default view |
| 10 | Kanban view | MVP | |
| 11 | Timeline / Gantt view | V1 | Dependencies arrows in V1; critical path V2 |
| 12 | Calendar view | V1 | iCal feed V1; 2-way Google sync V2 |
| 13 | Filters | MVP | Advanced AND/OR groups in V1 |
| 14 | Saved views | MVP | Personal + shared |
| 15 | Search | MVP (board-level) | Global cross-workspace search V1 |
| 16 | Forms | V1 | Conditional logic V2 |
| 17 | Dashboards | V1 (6 widgets) | 12+ widgets and portfolio dashboards V2 |
| 18 | Workload management | V2 | Needs timeline + effort columns first |
| 19 | Time tracking | V1 | Timer + manual entries |
| 20 | Recurring tasks | V1 | |
| 21 | Dependencies | V1 (finish-to-start) | All 4 types + auto-shift V2 |
| 22 | File attachments | MVP | Previews for images/PDF in MVP |
| 23 | Comments / updates & activity log | MVP | Threads + reactions MVP; email-reply-to-comment V2 |
| 24 | Notifications | MVP (in-app + email) | Push V2 (native apps) |
| 25 | Mentions | MVP | @person MVP; @team V1 |
| 26 | Templates | MVP (6 starter) | 12+ in V1; custom template saving V1 |
| 27 | Permissions & roles | MVP (basic) | Board-level permission levels V1; column-level ENT |
| 28 | Guest / client access | V1 | The flagship feature — polished, not rushed into MVP |
| 29 | Mobile experience | MVP (responsive web) | PWA V1; native iOS/Android V2 |
| 30 | Admin settings | MVP (basic) | Full console grows each phase |
| 31 | Billing & subscription plans | Deferred (post-V2) | Product is free for now — no billing code in any current phase (§2.9) |
| 32 | Audit logs | ENT | |
| 33 | API access | V1 (REST + webhooks) | GraphQL evaluated post-V2 |
| 34 | Third-party integrations | MVP (CSV import only) | Slack/Drive/Zapier V1; GitHub/Teams/HubSpot V2 |
| 35 | Automations | V1 (~25 recipes) | Custom recipe builder V2 |

AI-assisted capabilities layer onto the primitives above rather than being separate rows here — see §2.10.

---

### 2.1 Structure & Hierarchy

The containment model, top to bottom:

```
Account (one per customer company)
└── Workspace            e.g. "Client Work", "Internal Ops"
    └── Folder            e.g. "Acme Corp retainer"        (V1)
        └── Board          e.g. "Acme — Website Redesign"
            └── Group       e.g. "Sprint 12" / "In discovery"
                └── Item     e.g. "Homepage hero design"
                    └── Subitem  e.g. "Mobile variant"       (V1)
```

#### Workspaces

- A workspace is the top-level container for boards, folders, and dashboards, with its own member list.
- **Types:** `open` (any account member can join/browse) and `closed` (invite-only; existence hidden from non-members).
- **Fields:** `name` (≤ 60 chars), `type`, `icon` (emoji or 2-letter monogram + color), `description` (≤ 500 chars), `owners` (1–10 users).
- **Limits:** 20 workspaces per account (fair-use default, raisable on request). Max 500 members per workspace.
- **Example:** an agency runs workspaces "Client Delivery" (closed), "New Business" (closed), "Studio Ops" (open).

#### Boards

- A board is a collection of items sharing one column schema. The atomic unit of sharing, templating, and permissions.
- **Types:** `main` (visible to all workspace members), `private` (visible to invited members only), `shareable` (external guests can be invited — V1).
- **Fields:** `name` (≤ 120 chars), `description`, `type`, `board_owner`, `subscribers`, `item_terminology` (rename "item" per board: task / deal / candidate / deliverable).
- **Limits:** 20,000 items per board (hard), 100 boards per workspace (soft warning at 80), 50 columns per board, 200 groups per board.
- **Example:** "Acme — Website Redesign," type `shareable`, item terminology "Deliverables."

#### Folders (V1)

- Organize boards within a workspace. Max nesting depth 3. A board lives in exactly one folder (or the workspace root). Folders carry no permissions of their own (permissions live on boards/workspaces) — this keeps the mental model simple.

#### Groups

- Horizontal sections of a board (e.g., sprints, stages, months). Every item belongs to exactly one group.
- **Fields:** `title` (≤ 80 chars), `color` (one of 20 preset colors), `position`, `collapsed` (per-user).
- **Behaviors:** drag to reorder; collapse; group-level aggregates in the footer of numeric columns (sum/avg/min/max); "move all items to another group/board."
- **Example:** groups "Backlog," "This Week," "Waiting on Client" (color: orange), "Done."

#### Items

- The row/card/task — the core work object.
- **Built-in fields (always present, not columns):** `item_id` (globally unique, shown as `TRL-1042`), `name` (≤ 255 chars), `group_id`, `board_id`, `created_by`, `created_at`, `updated_at`.
- **Everything else is a column value** (§2.2).
- **Behaviors:** inline create (type at the bottom of a group, Enter to save and start the next — must feel spreadsheet-fast), duplicate (with/without updates), move to another group/board (with column-mapping prompt when schemas differ), archive (recoverable 30 days), delete (admin-recoverable 30 days, then purged).
- **Batch operations:** multi-select up to 500 items → change status, move, assign, delete, export.

#### Subitems (V1)

- One level only (subitems cannot have subitems) — this is a deliberate permanent constraint, matching monday.com; deeper nesting destroys the reporting model.
- Subitems have their **own column schema** per board (separate from parent items), default: `name`, `person`, `status`, `date`.
- Parent items show a rollup chip: "3/5 subitems done." Optional column setting: parent status auto-derived from subitems (`all done → Done`).
- **Limit:** 100 subitems per item.

---

### 2.2 Data Model: Columns & Status

#### Columns / custom fields

Columns define the schema of a board. Adding a column adds a field to every item on that board.

| Type key | Name | Config options | Phase |
|---|---|---|---|
| `status` | Status | Custom labels (≤ 20), each: text ≤ 30 chars, color, `is_done_state` flag | MVP |
| `text` | Text | Single line, ≤ 255 chars | MVP |
| `long_text` | Long text | ≤ 10,000 chars, plain text with line breaks | MVP |
| `number` | Number | Format: plain/currency/percent; decimals 0–4; unit label; aggregate function | MVP |
| `person` | People | Single or multiple assignees; restrict to board subscribers (on/off) | MVP |
| `date` | Date | Optional time component; overdue highlighting (red when past & status not done) | MVP |
| `dropdown` | Dropdown | Custom options (≤ 100), single or multi-select | MVP |
| `checkbox` | Checkbox | — | MVP |
| `timeline` | Timeline | Start + end date pair; drives Gantt bars | V1 |
| `tags` | Tags | Workspace-shared tag pool, autocomplete, ≤ 20 tags per item | V1 |
| `link` | Link | URL + display text | V1 |
| `email` | Email | Validated, click-to-compose | V1 |
| `phone` | Phone | With country code picker | V1 |
| `file` | Files | Multiple files per cell (≤ 25 per cell) | V1 |
| `rating` | Rating | 1–5 stars | V1 |
| `dependency` | Dependency | Links to other items on same board (§2.5) | V1 |
| `time_tracking` | Time tracking | Timer + manual entries (§2.5) | V1 |
| `formula` | Formula | Excel-like expressions over other columns; 40+ functions (`IF`, `DAYS`, `ROUND`, `CONCATENATE`…); read-only result | V2 |
| `connect_boards` | Connect boards | Link items across boards; enables `mirror` | V2 |
| `mirror` | Mirror | Display a column from a connected board's linked item | V2 |
| `auto_number` | Auto number | Sequential per board | V2 |
| `created_at` / `last_updated` | System info | Auto-maintained display columns | V2 |
| `location` | Location | Address + geocode | V2 |

- **Column fields:** `title` (≤ 60 chars), `type`, `description` (tooltip), `width`, `position`, `settings` (JSON per type).
- **Limits:** 50 columns per board; changing a column's type is not supported (create new + migrate) except widening `text → long_text`.
- **Example board schema** ("Acme — Website Redesign"): Deliverable (name) · Owner (`person`) · Status (`status`: Not started / In progress / Client review / Approved ✓done / On hold) · Due (`date`) · Phase (`dropdown`: Discovery, Design, Build, QA) · Estimate h (`number`, 1 decimal) · Brief (`link`) · Files (`file`).

#### Status tracking

- The signature interaction (like monday.com): a full-cell colored chip; click opens a label picker; changing a status is one click, animates, and is logged in the activity feed.
- **Label config:** up to 20 labels per status column; each label = `{text, color (from 20-color palette), is_done_state}`. Multiple labels may be done-states ("Approved," "Shipped").
- `is_done_state` drives: strikethrough styling, "done" filters, progress rollups, burndown widgets, and the default "mark complete" automation triggers.
- Default labels on new status columns: *Not started* (gray), *Working on it* (orange), *Stuck* (red), *Done* (green ✓).
- Board setting: `restrict_status_transitions` (Enterprise) — define allowed transitions, e.g. nothing moves to *Approved* except from *Client review*.

---

### 2.3 Views

Every view type below operates on the same underlying items — views are lenses, not copies. Per-view state: visible columns, column order/widths, filters, sort, group-by, collapsed groups.

#### Table / grid view (MVP — default)

- Spreadsheet-style: inline editing of every cell, `Tab`/`Enter`/arrow-key navigation, drag-fill is **not** supported (deliberate; use batch edit).
- Column footer aggregates per group and per board: `sum`, `avg`, `median`, `min`, `max`, `count` (numeric); "% done" (status).
- Virtualized rendering: smooth at 20,000 items (only visible rows in DOM).
- Row height: compact / medium / tall (per user, per view).
- Sort: up to 3 sort keys. Sticky first column (item name).

#### Kanban view (MVP)

- Stack by any `status`, `dropdown`, or `person` column.
- Card shows: item name + up to 6 chosen column chips + avatar + due-date badge (red if overdue).
- Drag between lanes updates the underlying column value; drag within a lane reorders.
- WIP limits per lane (V1): lane header turns red at > limit, e.g. "In progress 7/5."
- Swimlanes by a second column (V2).

#### Timeline / Gantt view (V1)

- Bars from a `timeline` column (fallback: `date` column renders 1-day bars). Rows grouped by group, person, or none.
- Drag bar edges to resize (updates dates); drag whole bar to shift.
- Zoom: day / week / month / quarter. "Today" line always visible.
- Dependency arrows drawn between bars (V1, display only); auto-shift on drag (V2, §2.5); critical-path highlighting (V2); baseline snapshots (Enterprise).
- Milestone rendering: an item whose timeline start = end renders as a diamond.
- Export view as PNG/PDF (V2) — agencies paste Gantts into client decks.

#### Calendar view (V1)

- Month / week / day layouts, driven by a chosen `date` or `timeline` column.
- Drag to reschedule; click empty day to create an item pre-filled with that date.
- **iCal feed** per view (read-only URL, tokenized, revocable) — V1. Two-way Google Calendar sync — V2.

#### Filters (MVP)

- Filter bar on every view. MVP: up to 20 rules combined with AND. V1: rule groups with AND/OR nesting one level deep.
- Operators by type: text `contains / is / is empty`; number `= ≠ > < between`; date `is / before / after / within last N days / next N days / overdue`; status/dropdown `is any of / is none of`; person `is any of / is me / is empty`.
- "Quick filters": one-click chips for *Assigned to me*, *Due this week*, *Overdue*, *Done hidden*.
- **Example:** `Status is none of [Done, Approved] AND Owner is me AND Due within next 7 days`.

#### Saved views (MVP)

- Save current view config (type + columns + filters + sort) with a name (≤ 60 chars).
- **Personal** (only you) or **shared** (everyone on the board; shown as tabs across the top). Board owners can reorder/pin shared view tabs; the leftmost shared view is what new visitors land on.
- Limit: 50 views per board. Any saved view can be the basis of a client share link (V1).

#### Search (MVP board-level, V1 global)

- MVP: `Ctrl/⌘+K` command palette — jump to boards, search items on the current board, and run commands ("create item," "switch workspace").
- V1: global search across workspaces the user belongs to. Scopes: **Items · Boards · Updates (comments) · Files · People**. Filters: workspace, board, assignee, status, date modified.
- Index freshness: new/edited content searchable within 60 seconds. Guests search only boards they're invited to. Results respect permissions absolutely — no title leakage from private boards.

---

### 2.4 Intake & Reporting

#### Forms (V1)

- Every board can expose N forms; a form submission creates an item in a chosen group.
- **Supported question types** (mapped to columns): `text`, `long_text`, `number`, `date`, `dropdown`, `checkbox`, `email`, `phone`, `file` (upload ≤ 25 MB/file, ≤ 3 files per submission).
- Form config: title, description, cover color, field order, required flags, hidden prefilled fields (e.g., `source=webform`), confirmation message or redirect URL, "submit another" toggle.
- Access: public URL (`https://forms.trellis.app/f/{slug}`), embeddable iframe, or workspace-members-only.
- Anti-spam: invisible CAPTCHA + 10 submissions/min/IP rate limit.
- Limits: 30 questions per form; 10,000 submissions/month per account (fair-use, §2.9).
- Conditional logic (show question B if answer A = x) — V2. The "Powered by Trellis" badge stays on all public forms for now — it's a growth channel; removing it becomes a paid perk only if monetization lands later.
- **Example:** "Creative Request" form → items land in group "Triage" on board "Studio Requests" with `Status = New request`.

#### Dashboards (V1)

- A dashboard is a widget canvas aggregating data from up to **20 boards** (raised to **50** in the Enterprise phase, when portfolio dashboards land).
- **V1 widget set (6):** Number/Counter (e.g., "Open items: 34"), Chart (bar/line/pie over any groupable column), Battery (% done across a board), Timeline (multi-board Gantt), To-do list (my items across boards), Text/notes.
- **V2 additions:** Workload widget, Time-tracked report, Table widget (filtered cross-board item list), Files gallery, Form-submission trend, custom date-range comparisons.
- Layout: responsive grid, drag/resize widgets, max 30 widgets per dashboard.
- Sharing: workspace members by default; client-shareable read-only dashboard link (V2) — an agency's "account health" page.
- Refresh: widgets update live via the same real-time channel as boards (< 5s staleness).

---

### 2.5 Planning & Execution

#### Workload management (V2)

- Grid: people (rows) × weeks (columns); cells show allocated effort vs. capacity.
- **Effort source** (board-level setting): item count, a chosen `number` column (e.g., "Estimate h"), or `time_tracking` estimates. Items spanning a `timeline` spread their effort evenly across working days.
- **Capacity:** default 40 h/week per person, editable per person; non-working days from workspace calendar; PTO entries (ENT).
- Over-allocation: cell turns amber at > 85%, red at > 100%; click a cell to see and reassign the underlying items.

#### Time tracking (V1)

- `time_tracking` column: start/stop timer (one running timer per user account-wide; starting a second stops the first) + manual entries.
- **Entry fields:** `started_at`, `ended_at`, `duration` (derived, editable), `user_id`, `note` (≤ 255 chars), `billable` (checkbox).
- Column cell shows total; expand for per-user breakdown. Board-level "Time report" export (CSV): item, user, date, duration, billable — the agency invoicing workflow.
- Limits: entries ≤ 24 h each; edits allowed by entry owner + board owner.

#### Dependencies (V1 basic, V2 full)

- `dependency` column links items on the same board. V1: **finish-to-start** only, arrows shown on Gantt, and a warning badge when a dependent item's dates precede its predecessor's finish.
- V2: all four types (FS, SS, FF, SF), `lag_days` (−365…+365), and **auto-shift modes** per board: `none` (warn only), `flexible` (shift dependents only when a conflict is created), `strict` (dependents always keep their offset).
- Circular dependencies rejected at save time with the path shown ("A → B → C → A").
- Limit: 50 dependency links per item. Cross-board dependencies: not supported (permanent constraint; use `connect_boards` + mirrors for visibility instead).

#### Recurring tasks (V1)

- Configured on an item: "Repeat this item."
- **Recurrence fields:** `frequency` (daily/weekly/monthly/yearly), `interval` (1–99), `by_weekday` (for weekly, e.g. Mon+Thu), `by_monthday` (1–31 or "last"), `ends` (never / after N occurrences / on date), `create_ahead_days` (0–30, default 0 = created on the due date at 00:05 workspace time).
- Each occurrence is a **new item** cloned from the template item (columns copied; updates/files not copied), named with an optional date suffix: "Weekly client report — Jul 17."
- Limits: 100 active recurrences per board. Paused automatically if the board is archived.

---

### 2.6 Collaboration & Awareness

#### File attachments (MVP)

- Attach to an item's Updates tab (MVP) or a `file` column (V1). Sources: upload, drag-drop, paste screenshot (MVP); Google Drive picker (V1); Dropbox/OneDrive (V2).
- **Per-file size limit:** 100 MB. **Storage quota:** 20 GB per account (fair-use, raisable on request). Both are cost-control caps, not product tiers — they become plan levers only if monetization lands later (§2.9).
- Inline preview: images, PDF, video (mp4/webm), audio; everything else downloads. Blocked extensions: `.exe .bat .cmd .msi .scr .ps1 .sh .dll`.
- File versioning (upload new version, keep history) — V2.

#### Comments / updates & activity log (MVP)

- Each item has an **Updates** tab: rich-text posts (bold/italic/underline, bullet/numbered lists, links, inline code, checklists), file attachments, @mentions, emoji reactions, and **one level of threaded replies**.
- Posts are editable by their author anytime (shows "edited"); deletable by author or board owner.
- **Activity log** (separate tab): immutable field-level history — *"Status: Working on it → Done — Ana Ruiz, Jul 10, 14:32."* Board-level activity feed aggregates all items.
- Retention of activity history: 1 year for all accounts (storage-cost cap; a natural plan lever if monetization lands later).
- V2: reply to a notification email to post a comment; V2: pin an update to the top.

#### Notifications (MVP)

- **Channels:** in-app bell (MVP), email (MVP), browser push via PWA (V1), mobile push (V2), Slack DM (V1 integration).
- **Events:** assigned to me · @mentioned · reply to my update · reaction to my update · status changed on an item I own (opt-in) · due date approaching (default: 09:00 workspace time, 1 day before) · item created on a board I subscribe to (opt-in) · automation failed (board owner) · form submission (form owner, opt-in) · guest accepted invite.
- **Email cadence** (per user): instant / hourly digest / daily digest at 08:00 / off. In-app is always instant. Unread badge caps at "99+."
- Per-board mute; account-level Do Not Disturb schedule (V1).

#### Mentions (MVP)

- `@name` in any update, reply, or long-text cell → notification + adds the person as an item subscriber.
- `@team-name` (V1) notifies a defined team (teams: named member groups, e.g. "@design", max 100 teams/account).
- `@board` (board owner only, V1) notifies all board subscribers — rate-limited to 2/day/board to prevent spam.

*(Search: covered in §2.3.)*

---

### 2.7 Reuse: Templates

- **Board templates** capture: columns, groups, saved views, automations (V1+), sample items (optional), form definitions. Not captured: real items' data, files, members.
- **Starter library:** MVP ships 6 — *Client Project Delivery, Creative Request Intake, Content Calendar, Simple Sprint, Client Onboarding, Bug/Issue Tracker.* V1 grows to 12+, adding *Agency Retainer Tracker, Event Plan, Recruiting Pipeline, OKR Tracker, Marketing Campaign, CRM-lite.* Every template opens pre-filled with realistic example items and a 60-second explainer note.
- **Custom templates** (V1): "Save board as template" → available account-wide (admins can restrict to specific workspaces). Limit: 100 custom templates/account.
- **Workspace templates** (V2): a bundle of boards + folders + dashboards — e.g., "New client engagement" spins up 4 boards and 1 dashboard, with cross-references remapped.
- Template versioning/marketplace: out of scope until post-V2.

---

### 2.8 Access & Governance

#### Permissions & roles

**Account-level roles:**

| Role | Can | Cannot |
|---|---|---|
| **Admin** | Everything: billing, members, security settings, all workspaces, recover deleted content | — |
| **Member** | Create/join workspaces & boards per workspace rules; invite members (toggleable by admin) | Touch billing, security, other users' private boards |
| **Viewer** (V1) | Read-only on boards shared with them; comment if allowed | Edit any content. Unlimited |
| **Guest** (V1) | Member-like abilities but only on specific `shareable` boards they're invited to | See workspace directory, browse anything not explicitly shared. Unlimited (fair use) |

**Board permission levels** (board owner sets; V1): `edit_everything` · `edit_content_only` (items/updates yes; columns/views/automations no) · `edit_own_items` (only items they created or are assigned to) · `view_only`.

**Column-level restrictions** (ENT): hide specific columns (e.g., "Internal cost") from chosen roles/people — the key enabler for sharing one board with a client while keeping margins private.

#### Guest / client access (V1 — flagship)

Two tiers of external access:

1. **Guest accounts** — real logins, invited by email to specific shareable boards. Can edit per board permission level. Free and unlimited.
2. **Client share links** — tokenized, no-account access to a **saved view** (read-only, or read+comment). Board owner picks which columns are visible; hidden columns are never serialized to the client. Link options: expiry date, password, revoke anytime. Client commenters identify with name+email (verified via 6-digit email code). Free and unlimited — this is the growth engine.
- Branding: accounts can set a logo + accent color on client views (V2). The "Powered by Trellis" footer stays on all client views for now — it is the growth loop — and becomes removable only if monetization lands later.

#### Admin settings

- **MVP console:** profile & photo; account name/logo; member list (invite by email, deactivate, change role); workspace management; password reset; session list ("sign out everywhere"); data export (all boards → CSV zip); 2FA (TOTP).
- **V1 additions:** teams management; guest overview (every external person and what they can see — auditable client access on one page); API token management; usage meters for all fair-use quotas (§2.9); notification defaults; account-level default board permissions.
- **V2 additions:** custom item terminology defaults, branding on client views, storage usage breakdown, inactivity auto-deactivation.
- **ENT additions:** SSO (SAML 2.0: Okta, Azure AD, Google Workspace), SCIM provisioning, enforced 2FA, IP allowlist, session duration policy, domain capture ("anyone @acme.com joins as member"), data residency (US/EU at signup), custom retention policies, HIPAA BAA (roadmap).

#### Audit logs (ENT)

- Immutable, admin-visible stream. **Event catalog (initial 24):** `user.login`, `user.login_failed`, `user.logout`, `user.invited`, `user.deactivated`, `user.role_changed`, `auth.2fa_enabled`, `auth.sso_config_changed`, `board.created`, `board.deleted`, `board.permission_changed`, `board.share_link_created`, `board.share_link_revoked`, `guest.invited`, `guest.removed`, `item.bulk_deleted`, `export.requested`, `file.downloaded`, `api_token.created`, `api_token.revoked`, `webhook.created`, `billing.plan_changed`, `workspace.created`, `workspace.deleted`.
- Each entry: `timestamp (UTC)`, `actor_id`, `actor_ip`, `event`, `target`, `metadata` (JSON). Retention 2 years; filter by actor/event/date; export CSV; streaming API endpoint for SIEM ingestion.

---

### 2.9 Platform

#### Mobile experience

- **MVP:** fully responsive web. Under 768 px, table view collapses to a card list (name, status chip, assignee, due date); kanban becomes single-lane swipe; bottom nav: Boards · My Work · Notifications · Search.
- **"My Work"** screen (MVP): all items assigned to me across boards, grouped by Today / This week / Later / Overdue — the mobile home screen.
- **V1:** installable PWA with browser push notifications.
- **V2:** native iOS + Android (React Native), offline read cache of recently opened boards + queued offline actions (create item, comment, change status) synced on reconnect. Push with deep links.

#### Business model & account limits (free for now)

**Decision (2026-07): Trellis is free for all users. No billing system is built in any current phase — no plan tiers, paywalls, trials, or upgrade prompts.** The strategy is to maximize adoption and the external-collaborator network first; monetization is revisited after V2 with real usage data.

Every account gets the full product as features ship in their phase, subject to one set of **fair-use limits**. These exist for cost control and abuse prevention — they are not product tiers:

| Limit | Value | Why it exists |
|---|---|---|
| Seats / members | Unlimited | — |
| Workspaces | 20 per account | Structure sanity |
| Boards & items | Unlimited (20,000 items per board) | Board cap is technical (§2.1) |
| Storage / max file size | 20 GB per account / 100 MB per file | Infrastructure cost |
| Activity history retention | 1 year | Storage cost |
| Automation runs | 25,000 per account /mo | Compute cost |
| Integration actions | 25,000 per account /mo | Third-party API cost |
| Form submissions | 10,000 per account /mo | Spam/abuse |
| API rate limit | 600 req/min per token | Abuse |
| Guests, viewers, client share links | Unlimited | The growth engine — never metered |

- Fair-use limits are raisable on request (manual, via support). Every quota has a usage meter in admin settings, so hitting one is never a surprise; exceeding one degrades gracefully (e.g., automations pause and notify the owner — nothing is ever deleted).
- **Future monetization (documented so architecture doesn't foreclose it):** the most likely model is per-seat freemium, with the fair-use limits above becoming plan levers (storage, automation runs, retention, branding removal). Engineering implication for Stages 2–4: route all quota checks through a single `entitlements` module from day one, so plans can be introduced later without a data migration or scattered rewrites.

#### API access (V1)

- **REST v1**, base `https://api.trellis.app/v1`. Auth: personal access tokens (scoped: `read`, `write`, `admin`); OAuth 2.0 for third-party apps (V2).
- Core resources at launch: `/workspaces`, `/boards`, `/groups`, `/items` (CRUD + `/items/{id}/column_values`), `/updates`, `/users`, `/files`, `/webhooks`.
- Pagination: cursor-based, `limit` default 50 / max 200. Errors: RFC 9457 problem+json. Rate limit: 600 req/min per token, with `Retry-After` headers.
- **Webhooks (V1):** subscribe per board to `item.created`, `item.updated`, `item.deleted`, `column_value.changed` (filterable to one column), `update.posted`, `form.submitted`. HMAC-SHA256 signatures; 3 retries with backoff; auto-disabled after 100 consecutive failures (owner notified).
- Full API design is specified in Stage 2/3 docs.

#### Third-party integrations

| Integration | What it does | Phase |
|---|---|---|
| CSV / Excel import & export | Import to new/existing board with column mapping + type inference preview; export any view | MVP |
| Slack | Notifications to channels/DMs; recipe actions ("when Status → Stuck, post to #alerts"); unfurl item links | V1 |
| Google Drive | File picker for attachments; live link previews | V1 |
| Zapier | Triggers: item created/updated, form submitted. Actions: create/update item, post update | V1 |
| Google Calendar | iCal feed (V1) → two-way sync (V2) | V1/V2 |
| Trello / Asana / monday.com importers | Guided migration incl. attachments and comments | V2 |
| GitHub | Link PRs/issues to items; auto-move status on PR merge | V2 |
| Microsoft Teams + Outlook | Notification bots; calendar sync | V2 |
| HubSpot / Salesforce | Deal → client project board handoff | V2/ENT |
| Make (Integromat) | Parity with Zapier | V2 |

#### Automations (V1)

- Recipe model: **When {trigger} [if {condition}] then {action}** — same mental model as monday.com.
- **V1 triggers:** status changes to X · item created · date arrives / N days before date · person assigned · column value changes · form submitted · every {day/week/month} at {time} · item moved to group.
- **V1 actions:** change status · move item to group/board · assign person · set date (+N days) · create item (from template) · notify person/team · post update · send Slack message · send email · create subitem.
- **Conditions:** up to 3 per recipe (column-value tests).
- Launch library: ~25 curated recipes; custom combinations of the above triggers/actions from day one; multi-step (action chains up to 5) in V2.
- **Transparency (pillar 3):** per-board Automation Activity log (every run: trigger item, timestamp, result, error detail), monthly run-quota meter, dry-run preview ("this would have fired 14 times last week"), failure notifications to board owner.
- Loop protection: an automation's actions can trigger other automations to depth 3, then the chain stops and is flagged.

### 2.10 AI-Assisted Features

AI ships from MVP as capabilities layered onto the primitives above, not as a separate module or a chat destination — pillar 4 (§1.1). Full feature design, UX entry points, grounding data, and the suggest-review-confirm governing principle are in [09-differentiation-and-ai.md](09-differentiation-and-ai.md).

| Feature | What it does | Phase |
|---|---|---|
| Natural-language search | Parses queries like "things Priya is behind on" into the existing filter DSL (§2.3) — results stay exact and permission-correct | MVP |
| Thread summarization | Condenses a long Updates thread into bullets + open questions | MVP |
| Task generation | Drafts items (matched to the board's real columns) from a short text brief | V1 |
| Automation suggestions | Proposes executable recipes (§2.9) from a board's real event history | V1 |
| Dashboard insights | One-line natural-language narration under a widget's existing data | V1 |
| Meeting-to-task conversion | Extracts action items from pasted meeting notes into draft items | V1 |
| Project planning | Drafts a full board structure (groups, items, dependencies) from a text description | V2 |
| Workflow suggestions | Ambient board-health suggestions from usage patterns | V2 |
| Risk detection | Flags at-risk deliverables from overdue/dependency/workload signals | V2 |
| AI assistant for board management | Executes real board operations via natural language, always with a confirm step | V2 / Enterprise |

Every row only ever *suggests* — a human confirms before anything is written, and a confirmed AI action is logged identically to a manual one (09 §2). No AI feature ever trains on share-link or client-portal content.

---

## 3. Phased Scope

### 3.1 Phase overview

| Phase | Timeframe | Goal | Access model | Exit criteria |
|---|---|---|---|---|
| **MVP** | Months 0–4 | Prove core board UX with design partners | Free — invite-only beta | 20 design-partner teams; ≥ 40% week-4 retention; item-edit p95 < 300 ms |
| **V1** | Months 5–9 | Public launch with the client-access wedge | Free — open signup | 500 weekly-active teams; ≥ 25% of active boards use a client share link or guest |
| **V2** | Months 10–18 | Scale, mobile, depth (workload, formulas, connect boards) | Free — open signup | 5,000 weekly-active teams; ≥ 40% month-3 team retention; native apps ≥ 4.5★ |
| **Enterprise** | Months 16–24 (overlaps V2) | Be deployable at 100+ seat organizations | Free — enterprise-readiness, not a paid tier | SOC 2 Type II report; 5 deployments at 100+ seats; SSO/SCIM/audit GA |

### 3.2 MVP (Months 0–4) — "A board you'd abandon your spreadsheet for"

The MVP bets everything on the core loop: *create a board → structure it with columns and groups → work items through statuses → collaborate in updates.* It must feel faster and more pleasant than both a spreadsheet and monday.com. No automations, no external sharing — but what ships is polished, and it's AI-assisted from day one.

**Included:**

| Area | Scope |
|---|---|
| Auth & account | Email+password and Google OAuth signup; single workspace; roles: admin, member; invite by email; 2FA (TOTP) |
| Boards | Main + private boards; groups; items; archive/delete with 30-day recovery; batch edit (≤ 500) |
| Columns | 8 types: `status`, `text`, `long_text`, `number`, `person`, `date`, `dropdown`, `checkbox`; custom status labels + colors |
| Views | Table (default, virtualized to 20k items) and Kanban; filters (20 AND rules + quick filters); 3-key sort; saved views (personal + shared, 50/board) |
| Collaboration | Updates with rich text, threads, reactions; @person mentions; item + board activity logs; file attachments in updates (10 MB/file, image+PDF preview) |
| Notifications | In-app bell + email (instant/hourly/daily digest); assigned/mentioned/replied/due-soon events |
| Search | `Ctrl/⌘+K` palette: board jump, current-board item search, quick actions |
| AI | Natural-language search layered on the `⌘K` palette; one-click Updates-thread summarization (§2.10, 09 §3.6/§3.9) |
| Templates | 6 starter board templates with example content |
| Mobile | Responsive web incl. "My Work" screen |
| Import/export | CSV import with mapping preview; CSV export per view |
| Admin | Member management, data export, session management |

**Explicitly deferred from MVP:** subitems, folders, multiple workspaces, timeline/calendar views, Gantt, forms, dashboards, automations, integrations (beyond CSV), guests/client links, API/webhooks, time tracking, dependencies, recurring items, teams/@team, global search, PWA push, and every AI feature past search + summarization (§2.10).

**Why this is still impressive:** speed (spreadsheet-grade inline editing), real-time multiplayer presence on boards, polished status interactions, opinionated templates, and AI-assisted search/summarization make demos land even without the long tail.

### 3.3 V1 (Months 5–9) — Public launch: "Run client work end to end"

**Everything in MVP, plus:**

| Area | Scope |
|---|---|
| Launch readiness | Open signup; fair-use quota metering + usage meters in admin (no billing — the product is free, §2.9) |
| Structure | Multiple workspaces (up to 20), folders (3 levels), subitems with rollups, teams (@team) |
| Columns | +9 types: `timeline`, `tags`, `link`, `email`, `phone`, `file`, `rating`, `dependency`, `time_tracking` |
| Views | Timeline/Gantt (drag, zoom, FS dependency arrows, milestones); Calendar (+ iCal feeds); kanban WIP limits; AND/OR filter groups |
| Client access ⭐ | Guest accounts (free, unlimited); client share links on saved views with column whitelisting, expiry, password, comment-with-email-code; guest audit page |
| Automations | Recipe engine, ~25 curated recipes, run history + dry-run + quota meter |
| Forms | Public/embedded forms, 9 question types, anti-spam, submission quotas |
| Dashboards | 6 widgets, up to 20 boards per dashboard |
| Work management | Time tracking (timer + manual + billable + CSV report); recurring items; FS dependencies with conflict warnings |
| Notifications | Slack channel/DM delivery; DND schedules; board mute |
| Search | Global cross-workspace search with scopes and filters |
| AI | Task generation from a text brief; automation-recipe suggestions from event history; dashboard insight narration; meeting-to-task conversion (§2.10, 09 §3.1/§3.4/§3.7/§3.8) |
| Platform | REST API v1 + webhooks; PAT management; Slack, Google Drive, Zapier integrations; custom board templates; PWA install + browser push |
| Board permissions | 4 levels (edit everything → view only) |

**Deferred to V2:** workload, formula/connect/mirror columns, native mobile apps, auto-shift dependencies, swimlanes, conditional forms, dashboard sharing to clients, 2-way calendar sync, importers (Trello/Asana/monday), GitHub/Teams, multi-step automations, file versioning, workspace templates, and the deeper AI capabilities — project planning, workflow suggestions, risk detection, AI assistant (§2.10).

### 3.4 V2 (Months 10–18) — Scale & depth

- **Workload management** (capacity grid, over-allocation alerts) — completes the resource-planning story.
- **Columns:** `formula` (40+ functions), `connect_boards` + `mirror`, `auto_number`, `location`, system-info columns.
- **Dependencies:** all 4 types, lag, auto-shift modes; Gantt critical path; PNG/PDF Gantt export.
- **Native mobile apps** (iOS/Android, offline read + queued writes, push).
- **Automations:** custom multi-step recipes (up to 5 actions), cross-board actions, webhooks as actions.
- **Dashboards:** 12+ widgets incl. workload & time reports; client-shareable dashboard links; portfolio (50-board) dashboards.
- **Integrations:** GitHub, Microsoft Teams + Outlook, 2-way Google Calendar, Make, Trello/Asana/monday importers, Dropbox/OneDrive.
- **Collaboration:** email-reply-to-comment, pinned updates, file versioning.
- **Forms:** conditional logic, multi-page forms.
- **Platform:** workspace templates, i18n (first 5 languages: ES, FR, DE, PT, NL), OAuth 2.0 for third-party apps.
- **AI:** project planning (full board drafts from a text brief), ambient workflow suggestions, risk detection (needs this phase's workload + dependency depth), and an AI assistant beta for board management — always suggest-then-confirm (§2.10, 09 §3.2/§3.3/§3.5/§3.10).

### 3.5 Enterprise (Months 16–24, overlapping V2)

- **Identity:** SAML 2.0 SSO (Okta, Azure AD, Google Workspace), SCIM provisioning/deprovisioning, enforced 2FA, domain capture.
- **Governance:** audit log (24-event catalog, 2-year retention, SIEM streaming), column-level permissions, status-transition restrictions, custom data-retention policies, IP allowlist, session policies.
- **Data:** EU data residency at signup; account-level scheduled exports; 99.9% uptime SLA.
- **Compliance:** SOC 2 Type II, GDPR DPA, HIPAA BAA on roadmap.
- **Scale features:** Gantt baselines, PTO in workload, white-label client views, raised fair-use quotas (e.g., 250k automation runs/mo), sandbox account for admins.
- **Go-to-market:** white-glove onboarding for 100+ seat accounts, security questionnaire pack. Still free — this phase is about enterprise *readiness*; it is also where a paid tier would most naturally appear if monetization is ever revisited.

### 3.6 Explicit non-goals (all phases)

1. **Docs/wiki editor** — integrate Notion/Google Docs via link previews instead.
2. **Whiteboards** — link Figma/FigJam/Miro.
3. **Chat** — Slack/Teams integrations, never a chat product.
4. **Full CRM / dev issue tracker / HR verticals** — templates + integrations only. (The AI-generated "Client Hub" in 09 §1 is a rollup lens over existing data, not a CRM.)
5. **Self-hosted deployment** — multi-tenant cloud only.

---

*Next: Stage 2 — (per project plan). This document is the source of truth for scope; changes require updating the phase tables above.*
