# 07 — UX Flows

| | |
|---|---|
| **Product** | Trellis |
| **Document** | Stage 3 of 4 — UX Flows |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-10 |
| **Depends on** | [01](01-vision-and-scope.md), [02](02-data-model.md), [04](04-api-design.md), [05](05-automation-engine.md), [06](06-frontend-architecture.md) |

Each flow below is written as concrete, numbered steps referencing the exact screens, button copy, and endpoints defined in earlier docs — a designer can wireframe directly from these, and an engineer can map each step to an API call.

---

## 1. First-Time Onboarding

**Actor:** Priya, signing up Northpeak Agency for the first time. **Entry:** marketing site "Start free" button.

1. `/signup` — email + password fields, or `Continue with Google`. On submit: `POST /auth/signup` (04 §2.1); verification email sent (no email-confirmation gate before proceeding — reduces drop-off, matches unlimited-free positioning from 01 §2.9).
2. **"What should we call your organization?"** — single field, defaults to a guess from the email domain (`Northpeak Agency` from `@northpeak.agency`). Creates the `organizations` row and Priya's `admin` `org_memberships` row.
3. **"What kind of work do you manage?"** — 4 illustrated cards: *Client projects*, *Marketing & content*, *Internal ops*, *Something else*. Selection only tags analytics and pre-selects the template offered in step 5 — it does not gate any feature.
4. **"Who else is coming?"** — optional email invite field (comma-separated, up to 10), `Skip for now` is equally prominent (bottom-up adoption per 01 §1.2 — never force invites before value is shown).
5. **First workspace + first board, created together.** Copy: *"Let's set up your first board."* A single screen offers: the template matching step 3's answer (e.g., *Client Project Delivery*) pre-selected, with `Start from scratch` as a visible secondary option. Confirming calls `POST /workspaces` then `POST /workspaces/{id}/boards {template_id}` (04 §2.3–2.4).
6. Lands directly on the new board (`/w/northpeak-agency/b/{boardId}/table`) with the template's example items already visible — not an empty state. A 4-step dismissible coach-mark sequence highlights: the `+ New item` button, a status chip (click it to see it change), the `Share` button, and the view tabs.
7. **Behind the scenes:** entitlements initialize (`quota_overrides = null`, defaults apply), a default notification preference row is created (`instant` email cadence), and Priya is auto-subscribed to the new board.

---

## 2. Creating a Workspace

**Entry:** sidebar `Workspace ▾` switcher, or Priya wants to separate "Client Work" from "Studio Ops."

1. Click the workspace switcher at the top of the sidebar → dropdown lists existing workspaces + `+ New workspace` pinned at the bottom.
2. Modal: **Name** (≤ 60 chars, required), **Icon** (emoji picker or 2-letter monogram + color), **Type**: `Open` (any org member can browse/join, default) or `Closed` (invite-only, hidden from non-members) — with one line of inline help distinguishing them, since this choice is hard to reverse smoothly.
3. `Create workspace` → `POST /workspaces` (04 §2.3). On success, redirects to the new empty workspace home (`/w/{slug}`), which shows a single centered `+ New board` prompt rather than an empty board list with no affordance.
4. The creator is automatically a workspace owner (`workspace_members.is_owner = true`); if `Closed`, an **Add members** panel opens immediately as a secondary step (skippable).
5. **Limit awareness:** if the org is at 20 workspaces (01 §2.9 fair-use cap), the `+ New workspace` action instead opens a message: *"You've reached 20 workspaces. Archive one or contact us to raise this limit"* — never a bare error.

---

## 3. Creating a Board

**Entry:** `+ New board` from a workspace home, or `+` next to a folder in the sidebar tree.

1. Modal opens with two tabs: **Start from a template** (default, showing the 6+ starter templates as cards, 01 §2.7) and **Start from scratch**.
2. *Template path:* click a card → inline preview (sample items visible in miniature) → `Use this template`. *Scratch path:* just a **Name** field and optional **Folder** picker.
3. `Create` → `POST /workspaces/{id}/boards` (04 §2.3), returns immediately (no loading screen — board renders with a skeleton table while columns/items stream in, matching the 01 §1.1 speed pillar).
4. Board opens directly in Table view with the **inline board-name field focused and editable** — the first thing a new board invites you to do is name it precisely, even if you typed one in the modal.
5. If created from scratch, the board ships with Trellis's default schema (a `status` column with the four default labels, 02 §3.2) and one group, *Group 1* — never a literally empty grid, since an empty table has no obvious next action.
6. **Board type** (`main` vs `private` vs `shareable`) defaults to `main` and is changed later from Board Settings, not at creation — keeping the creation flow to a single decision.

---

## 4. Adding Columns

**Entry:** the `+` header at the far right of the table view, or the column header caret menu.

1. Click the `+` column header → a type picker opens (grouped: *Basic* — Status, Text, Number, Person, Date, Dropdown, Checkbox; *Advanced* — Timeline, Tags, Link, File, Rating…; *Formula/Connect*, greyed with a "V2" tag if not yet available).
2. Selecting a type (e.g., **Status**) opens its settings panel inline: **Column name** field, then the type-specific config — for Status, a label-list editor: each label has a text field (≤ 30 chars), a color swatch picker (20-color palette), and an `Is a "done" state` toggle; `+ Add label` up to 20; drag handles reorder.
3. `Add column` → `POST /boards/{id}/columns` (04 §2.4); the new column appears at the right edge of the table immediately, and every existing item gets an empty cell (no migration wait — the sparse `column_values` model means nothing has to backfill, 02 §3.3).
4. **Editing later:** header caret → `Edit column` (same panel, pre-filled), `Duplicate`, `Hide` (view-local), `Delete` (confirmation modal warns "values are recoverable for 30 days," 02 §3.2).
5. At the 50-column cap, the `+` picker is replaced with the limit message rather than disabled silently.

---

## 5. Creating Tasks (Items)

Two entry points, covering the "fast" and "detailed" cases.

**Fast path — inline creation (table or kanban):**
1. Click the `+ New item` row at the bottom of any group (or press `N` — keyboard-first, 01 §1.1).
2. Type the name, press `Enter` → item is created (`POST /boards/{id}/items`, 04 §2.5) and a **new blank row appears immediately below with focus already in it** — this is the spreadsheet-fast loop the product is built around; a user can add ten items without touching the mouse.
3. Default column values are empty; the user tabs across the row filling cells inline (§6 of doc 06) or leaves them for later.

**Detailed path — full item panel:**
1. Click `+ New item` while holding nothing special, or click any existing item to open the right-side slide-over (doc 06 §4).
2. The panel shows the item name (editable header), then every column as a labeled field stacked vertically — the same cell editors as the grid, just roomier.
3. Below the fields: **Updates** tab (post a comment, @mention teammates — typing `@` opens a searchable member popover, selecting inserts a mention node and, on save, notifies that person, 03 §7), **Files** tab (drag-drop or paste-to-upload), **Subitems** tab (`+ Add subitem`, same inline-creation pattern one level down), **Activity** tab (read-only field-change history).
4. Closing the panel (`Esc` or the `×`) returns focus to the originating row — no navigation history entry consumed, so browser-back still leaves the board.

---

## 6. Switching Views

1. The view-tabs row directly under the board header (doc 06 §3) lists all shared views as tabs plus a `My views ▾` dropdown for personal ones.
2. Clicking a tab is instant client-side navigation (`/…/{viewSlug}`) — the underlying item data is already cached by TanStack Query from the board fetch, so switching Table → Kanban re-renders without a network round trip unless the new view needs fields not yet loaded.
3. `+ Add view` → picks a type (Table, Kanban, Timeline, Calendar) and a name; new views inherit the current filter/sort as a starting point rather than opening blank.
4. Each view's **filter, sort, and visible-column state persists per view**, not globally — switching from a filtered "My open items" Kanban tab to the unfiltered Table tab shows all items again, exactly as configured, avoiding the "why did my filter disappear" confusion.
5. Reordering tabs: drag a tab left/right (dnd-kit, doc 06 §6); the leftmost shared tab becomes the default landing view for anyone opening the board fresh, including guests and share-link visitors (01 §2.3) — reordering tabs is therefore a meaningful, board-owner-only action, restricted accordingly.

---

## 7. Building an Automation

**Scenario:** Priya wants: *when a deliverable's Status changes to Approved, notify her.*

1. From the board, click the automation bell icon in the header (shows a count badge of active recipes) → opens `/b/{boardId}/automations`.
2. `+ Add automation` → a modal offers **Browse recipes** (searchable library, e.g. searching "approved" surfaces a close match) or **Create custom**; Priya picks **Create custom** since she wants a specific person notified, not the default "board owner."
3. **Step 1 — When:** trigger-type picker, categorized (doc 06 §10). She picks **Status changes**, then a config row appears: *Column* → `Status`, *To* → `Approved` (label picker, matching the board's actual labels).
4. **Step 2 — If** *(optional, skipped here)*: `+ Add condition` is visible but she clicks `Next` without adding one.
5. **Step 3 — Then:** action picker → **Notify someone**, config: *Who* → a person-search field, she selects herself; *Message* → a template field pre-filled with `"{item.name} was approved"`, editable.
6. Throughout steps 3–5, a sentence banner above the form updates live: *"When **Status** changes to **Approved**, notify **Priya Raman**."* — she reads this once to confirm intent instead of re-deriving it from the form fields.
7. `Save` → a secondary prompt offers **Preview last 7 days** (calls the dry-run endpoint, 04 §3.8): *"This would have fired 3 times in the last 7 days."* Seeing a sane number, she clicks **Enable**.
8. The recipe now appears in the board's automation list, toggle on. The Automation Activity tab (doc 06 §10) will show every future firing — she's shown where to check that on save, closing the loop on pillar 3's transparency promise (01 §1.1).

---

## 8. Inviting Team Members

**Two distinct flows: internal teammates vs. an external client** — deliberately different, since client access is the product's differentiator (01 §1.1 pillar 1).

**Internal teammate:**
1. Sidebar `+ Invite` (always visible, low-friction) or `/org/settings/members` → `Invite people`.
2. Enter email(s), comma- or newline-separated, pick a **role**: Admin, Member, or Viewer (01 §2.8); optionally pre-select which workspaces they land in.
3. `Send invites` → `POST /org/invites` (04 §2.2) per email; each recipient gets an email with an accept link (30-day expiry). Pending invites appear in the member list greyed out with a `Resend` action until accepted.
4. On acceptance, the person is auto-added to any workspaces marked `Open` and the ones explicitly pre-selected for `Closed` ones.

**External client (the wedge — share-link path, no invite needed):**
1. From any board, click `Share` in the header (doc 06 §4).
2. Panel: pick a **saved view** to share (defaults to the board's default view), toggle **View only** vs **Can comment**, a **column visibility** checklist (unchecked columns — e.g., an internal "Margin" number column — are never sent to the client, 01 §2.8), optional password and expiry date.
3. `Create link` → `POST /views/{id}/share-links` (04 §2.6) returns a URL **shown once**, with a `Copy link` button — Priya pastes it into an email to her client contact herself; Trellis does not send it on her behalf, keeping the relationship first-party.
4. When the client opens the link and wants to comment, they enter their name + email and receive a 6-digit code (2-minute delivery SLA in practice) to verify — no account creation, no password.
5. Every link created is listed under `/org/settings/guests` (the guest-audit page, 01 §2.8) with access counts and a one-click `Revoke`, so Priya's admin can always see who can see what, even though Priya set it up from a board she owns.

---

## 9. Using Dashboards

**Scenario:** Priya wants a one-page view of all active client projects for her Monday standup.

1. Sidebar `Dashboards` → `+ New dashboard` → **Name** field ("Client Health"), created empty.
2. `+ Add widget` opens the widget-type gallery (doc 06 §8): she picks **Battery** (percent-done meter).
3. Config panel: **Source boards** (multi-select, up to 20) → she picks all 6 of her active client boards; **Column** → `Status`, with "Done" states auto-detected from each board's `is_done` label flags (02 §3.2) so percent-complete is comparable across boards with differently worded status labels.
4. Widget appears on the grid canvas; she drags its bottom-right corner to resize it wider, then drags a second widget (**Table**, filtered to `Status = Stuck` across the same 6 boards) below it — layout autosaves 500 ms after she stops dragging (doc 06 §8), no explicit save button.
5. She repeats for a **To-do** widget scoped to `Assigned to me`, giving her a personal action list alongside the portfolio view on the same page.
6. Sharing: the dashboard is visible to anyone in the "Client Work" workspace by default; a teammate with less board access who opens it later sees a smaller number on the same Battery widget, with a small note explaining it reflects only the boards they can access (doc 06 §8) — Priya isn't shown this since she has full access, avoiding a confusing discrepancy for the dashboard's primary owner.

---

## 10. Managing Notifications

1. `/settings/notifications` (personal settings, doc 06 §11).
2. **Email cadence** selector: `Instant` / `Hourly digest` / `Daily digest at 8:00 (your timezone)` / `Off` — a single account-wide default (02 §5.5).
3. **Per-event overrides** below it: a table of event types (Assigned to me, Mentioned, Reply to my update, Status changed on items I own, Due date approaching, Automation failed…) each with an independent channel toggle (in-app always on; email follows the cadence above unless overridden here) — most users never touch this section, but power users muting noisy events (e.g., "Item created on a board I subscribe to") find it here rather than as a global on/off.
4. **Do Not Disturb** schedule: start/end time + day picker; in-app notifications still arrive silently (badge updates), only email/push delivery pauses.
5. **Per-board mute:** from any board's `⋯` menu, `Mute notifications for this board` — a faster path than the settings page for the common case of "I don't need updates from this one board," reflected in `board_mutes` (02 §5.5) without touching the account-wide preferences.
6. The in-app notification bell (top-right, always visible) opens a panel of recent notifications grouped by day, `Mark all as read`, and clicking any entry deep-links to the relevant item/board and marks that one read — the same click that satisfies curiosity also clears the badge, avoiding a separate "mark read" chore.

---

## 11. Getting AI Assistance

Natural-language search and thread summarization ship in MVP; task generation ships in V1 alongside the automation and dashboard work (08 §4). Every flow below follows one rule, no exceptions: **AI drafts, a human confirms** (09 §2) — nothing here ever writes to a board without an explicit click.

**Natural-language search (MVP):**
1. Press `⌘K` (or click the search affordance in the board toolbar, doc 06 §4) and type a plain-English query instead of a keyword — e.g. *"things Priya is behind on"*.
2. Results appear as normal, but a chip above them shows the parsed interpretation: *"Owner is Priya Raman AND Due date is overdue"* (`GET /search?nl=true`, 04 §3.10) — editable, so a user can nudge it ("due *this week*, not overdue") without retyping the whole query in English.
3. `Save as view` turns the parsed filter into a normal saved view (doc 06 §6) — natural-language search is a faster way to *arrive* at a filter, not a separate search system living alongside the real one.

**Thread summarization (MVP):**
1. Open an item with a long Updates thread (§5 above) — once it passes roughly 10 replies, a **Summarize** button appears at the top of the tab (doc 06 §4).
2. Click it → 3 bullets plus an "Open questions" line appear inline, collapsible back to the full thread. Nothing is posted as a new comment; it's a client-side rendering of `POST /items/{id}/comments/summarize` (04 §2.13), regenerated on demand, never cached stale.

**Task generation from a brief (V1):**
1. From `+ New item`, choose **Generate from brief** instead of typing a single item name.
2. Type a short description — *"Redesign homepage for Acme, due in 6 weeks"* — and submit.
3. A **Pending AI suggestions** tray opens at the top of the group showing the drafted items (Wireframes, Copywriting, Client review, …), each with column values already filled against the board's real schema (04 §3.11) — nothing exists on the board yet.
4. Review each: edit inline, remove one that doesn't fit, or `Add all`. Only the confirm click calls `POST /items` — visible in the activity log exactly like a manual create (02 §5.3), so a teammate scanning history later can't tell the difference between an AI-assisted item and a hand-typed one except by the `via` tag.

---

*This is the final document in the 4-stage Trellis blueprint (docs 00–10). See [08-roadmap.md](08-roadmap.md), [09-differentiation-and-ai.md](09-differentiation-and-ai.md), and [10-security-compliance.md](10-security-compliance.md) for the build sequencing, AI feature design, and security posture that complete this specification.*
