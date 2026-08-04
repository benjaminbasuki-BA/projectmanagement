# 09 — Differentiation & AI

| | |
|---|---|
| **Product** | Trellis |
| **Document** | Stage 4 of 4 — Differentiation & AI |
| **Status** | Draft v1.1 — AI repositioned as a core pillar, shipping from MVP (2026-07-10) |
| **Date** | 2026-07-10 |
| **Depends on** | [01](01-vision-and-scope.md) §1.1 pillar 4, §2.10, [02](02-data-model.md) §6.6, [03](03-backend-architecture.md), [05](05-automation-engine.md), [06](06-frontend-architecture.md), [07](07-ux-flows.md) §11, [08](08-roadmap.md) |

Trellis is AI-powered: pillar 4 of the product (01 §1.1), not a deferred experiment. Natural-language search and thread summarization ship in **MVP**; task generation, automation suggestions, dashboard insights, and meeting-to-task conversion ship in **V1** alongside the primitives they layer onto; the deepest capabilities — project planning, workflow suggestions, risk detection, and the AI assistant — land through **V2/Enterprise**, sequenced by risk rather than by convenience. The full build sequencing is in [08-roadmap.md](08-roadmap.md).

---

## 1. Differentiation Strategy

AI-native workflows are the lead differentiator — not an add-on alongside the others, but woven through them (pillar 4, 01 §1.1). It's presented first, with the product's other differentiators as reinforcing pillars rather than a fallback:

| Differentiator | Concretely | Why this beats monday.com's version |
|---|---|---|
| **AI woven into existing workflows** (pillar 4) | Search, thread catch-up, and task drafting all get an AI-assisted path from inside the tool a user already has open — never a separate chatbot destination (§2–§3) | Competitors bolt AI onto a sidebar widget that most users never open; ours shows up exactly where the work already happens, and every suggestion is reviewable before it changes anything real |
| **Client-grade sharing** (01 §1.1 pillar 1) | Every board has a two-click client portal; hidden columns never serialize (01 §2.8) | monday.com treats guests as a billed, bolted-on afterthought (4:1 billing, clunky invite flow) |
| **Client Hub** *(new idea, V2)* | A rollup page per named client aggregating every board, share link, and contact tagged to them — built entirely from existing primitives (`share_link_visitors` + a `client` tag on workspaces/folders, 02 §2, §4.3), not a new module | Deliberately **not** a CRM (01 §3.6 non-goal #4) — it's a lens over data Trellis already has, not deal pipelines or contact scoring |
| **Speed as a headline feature** (01 §1.1 pillar 2) | Sub-100ms UI budget is enforced in CI, not aspirational; keyboard-first for every core action | monday.com's board rendering visibly lags at scale; we treat the p95 budget as a shippable requirement, not a nice-to-have |
| **Transparent automation builder** (05) | The recipe's plain-English sentence *is* the stored logic, not a rendering of it; every run is logged with pass/fail per condition — the same transparency habit AI suggestions inherit (§2) | Competitors' automation failures are silent; ours are a first-class, debuggable surface — this becomes literal marketing material (screenshots of the run log) |
| **Reporting that explains itself** *(new idea, V2)* | Saved "Client Health" dashboard templates; scheduled digest email of any dashboard (reuses the existing `digest-builder` job, 03 §6, as a new digest type); one-click PDF/PNG export of a dashboard (extends the Gantt export already planned for V2, 01 §2.3); AI insight narration under every widget from V1 (§3.8) | monday.com dashboards are session-bound and mute; ours land in an inbox every Monday morning already explaining themselves |
| **No monetization friction** | The product is free during this phase (01 §2.9) — no seat-gating, no feature paywalls, no "upgrade to unlock" interruptions, including for AI features | This is a genuine differentiator *today*, not a future promise — worth stating plainly rather than designing around a paid tier that doesn't exist yet |

---

## 2. Governing Principle for Every AI Feature

Before the catalog: one rule applies to all ten features below, inherited directly from the automation engine's pillar-3 design (05 §10.3) — **AI suggests, a human confirms, and every confirmed action is indistinguishable from a manual one in the audit trail.**

- No AI feature ever silently mutates board data. Every generative feature produces a **draft/pending state** requiring one explicit confirm click.
- A confirmed AI action calls the same domain services the REST API and automation engine call (04, 05 §10.3) — logged in `activity_events` with `actor_id` = the confirming user and `metadata.via = 'ai_assistant'` (02 §5.3). There is no shadow write path.
- An AI feature never reads data the requesting user couldn't already see — permission-bound exactly like dashboard widgets (03 §4). Client-portal and share-link data is never used for model training or fine-tuning; for an agency-facing product this is a hard boundary, not a preference — "your client's data trained a model" is close to a dealbreaker for the primary persona (01 §1.2).

---

## 3. AI Feature Catalog

### 3.1 Task generation — V1

**What:** from a short brief, AI drafts a set of items pre-filled against the board's *real* column schema — never invented fields. **Example:** typing "Redesign homepage for Acme, due in 6 weeks" into a board's `+ New item → Generate from brief` option drafts: *Wireframes, Copywriting, Visual design, Dev handoff, QA, Client review* — each with a `Phase` dropdown value matching the board's actual labels and due dates spaced across the 6-week window. **Grounding:** reads `columns` + `columns.settings` (02 §3.2) so generated values are always valid; optionally few-shots against the org's own historical items (opt-in setting). **Review gate:** items land in a "Pending AI suggestions" tray in the group header, one-click **Add all** or per-item accept/discard.

### 3.2 Project planning — V2

**What:** given a text description, target end date, and (if V2 workload is live) team size, AI proposes a full board structure — groups as phases, items per group, and dependency links. **Example:** "8-week client onboarding for a 40-person company, 3 people on our side" → proposes groups *Discovery, Setup, Migration, Training, Go-live* with items and FS dependencies between phases. **Entry point:** the template gallery (06 §10) gains an "AI Project Planner" tile alongside static templates. **Review gate:** produces a full draft board the user edits or discards before it's saved — architecturally identical to accepting a template (04 §2.4), just template-instantiation-from-text instead of from a fixed template_id.

### 3.3 Workflow suggestions — V2

**What:** passively watches a board's actual usage (`activity_events`, 02 §5.3) and surfaces structural improvement suggestions. **Example:** *"12 items have been stuck in 'In progress' for over 2 weeks — consider adding a 'Blocked' status"* or *"This board has no way to notify anyone when Status reaches Done — want one?"* **Entry point:** a dismissible insight card near the board header (never a modal — this is ambient, not interruptive), refreshed weekly by a background job. **Grounding:** read-only analysis over `activity_events` + `columns` — this feature never writes anything itself, it only surfaces a suggestion that routes into §3.4's flow if it's automation-shaped.

### 3.4 Automation suggestions — V1

**What:** proposes concrete, *executable* doc-05-style recipes from real event history — never a suggestion the deterministic engine can't actually run, since suggestions are constrained to the existing trigger/condition/action catalog (05 §1.1–1.3). **Example:** *"Items moved to 'Client review' are rarely followed by a notification — add 'When Status → Client review, notify board owner'?"* **Entry point:** one click opens the automation builder (06 §10) **pre-filled** with the suggested trigger/condition/action, still requiring the same review-and-enable flow as building one manually (07 §7) — the AI fills the form, it never flips the toggle.

### 3.5 Risk detection — V2

**What:** scans for overdue-item clustering, at-risk dependency chains (an overdue item with downstream FS dependents, 01 §2.5 V2), or workload overallocation (V2 workload grid, 01 §2.5), and surfaces a project-health signal. **Example:** *"3 deliverables due this week depend on 'Homepage copy approval,' which is 4 days overdue — client review is at risk."* **Surfaces via:** a new AI-generated dashboard widget type (extending the 6+ MVP widgets, 02 §7.2) and/or a weekly digest email to the board owner (reusing `digest-builder`, 03 §6). **Phase gate:** genuinely needs V2's dependency and workload data to be worth building — this is the one feature in the catalog that's phase-gated by data availability rather than risk (08 §5).

### 3.6 Summarization — MVP

**What, item-level:** a "Summarize this thread" button in the item panel's Updates tab (06 §4), condensing a long comment thread into 3 bullets + open questions — useful when a producer picks up a client thread with 40 replies. **What, board-level:** a weekly "What happened on this board" digest, added as a new digest type to the existing `digest-builder` job (03 §6). **Grounding:** reads `comments.body_text` + `activity_events` (02 §5) — no new data model needed.

### 3.7 Meeting-to-task conversion — V1

**What:** paste meeting notes or a transcript into a text box; AI extracts action items and proposes them as draft items, with a suggested assignee matched against board members' names/@mentions found in the text, and a due date if a timeframe was stated. **Entry point:** `+ New item → From meeting notes` (06 §4/07 §5's "detailed path," extended with a third entry). **Review gate:** identical pending/confirm tray as §3.1 — this is the same underlying mechanism (text → grounded draft items) with a different input source.

### 3.8 Dashboard insights — V1

**What:** a one-line natural-language annotation under any widget, computed by having the AI read the widget's *already-fetched, already-permission-filtered* data (02 §7.2, 03 §4) and phrase it — not a new query capability, pure narration over existing aggregates. **Example, under a Battery widget:** *"Completion rate dropped 15% this week, driven by the Acme board."* **Why this is safe by construction:** the AI never issues its own query against the database; it only summarizes data the widget's config already scoped to the viewing user's permissions — a user cannot get an insight about data they couldn't otherwise see on that same dashboard.

### 3.9 Natural-language search — MVP

**What:** extends `⌘K`/board search (01 §2.3, 03 §8; global cross-workspace scope from V1) to parse queries like *"things Priya is behind on"* or *"client review items due this month"* into the **existing structured filter DSL** (02 §4.1) — a translation layer in front of the deterministic filter engine already built, not a separate retrieval system. **Why this matters:** results stay exact, permission-correct (the underlying filtered query still runs through normal authz, 03 §4), and explainable — the parsed filter is always shown alongside results, editable by the user, so anyone can see literally what the AI understood before trusting the result set. This mirrors the transparency habit established for automations (05 §10.7).

### 3.10 AI assistant for board management — V2/Enterprise

**What:** a persistent chat entry point (command-palette extension or a dedicated panel) that executes real board operations — *"Move all overdue items in Design to Blocked,"* *"Create a client-review checklist for TRL-1042,"* *"Who hasn't touched their items in 2 weeks?"* **Mechanism:** the assistant calls the same domain services the REST API calls (04) via a tool-use/function-calling interface — never a separate write path. **Confirmation:** every action is shown as a preview before executing ("This will update 4 items — Confirm?"), with an **extra** explicit confirmation for anything destructive-looking or cross-board (bulk delete, move-to-another-board). **Why it ships last, not "if":** it's the most powerful and highest-risk feature in the catalog, so it's sequenced to land only after the review-before-execute pattern has been proven across every lower-risk feature above (08 §5–§6) — a deliberate rollout order, not a hedge about whether it gets built.

---

## 4. Shared AI Infrastructure

- **Provider-agnostic `ai` module** (03 §2's module-boundary pattern, alongside `entitlements`/`integrations`): all ten features call this module, not a vendor SDK directly, so switching providers or adding a self-hosted option later is a config change, not a rewrite. Requirements the chosen provider must support: function-calling/tool-use (§3.10), structured output (§3.9's filter-DSL translation, §3.1/§3.7's draft-item generation).
- **`ai_interactions` table** (02 §6.6): built **from MVP**, not deferred — since AI ships from MVP, usage-data collection has to start on day one. Logs every suggestion shown, accepted, edited, or dismissed — this is the literal mechanism for the "is this feature earning its keep" evaluation that should keep gating each subsequent AI feature's rollout (08 §3–§5), even though AI itself is no longer a maybe.
- **Quota:** once shipped, AI calls route through the same `entitlements` module as every other fair-use limit (02 §9) — a specific number is deferred to MVP usage data rather than invented here; this is a cost/abuse control, not a pricing tier (no pricing is designed in this document, per the phase's free-for-now status, 01 §2.9).
- **Privacy boundary, restated as a hard constraint:** no share-link/client-portal content is ever included in any model training or fine-tuning corpus, full stop.

---

## 5. Phasing (risk-ordered within an AI-first roadmap)

AI ships starting in MVP — the sequencing question isn't *whether* a feature is on the roadmap, it's *when in the risk curve* it's safe to ship. Read-only and translate-to-deterministic-query features go first; draft-creation features prove out the confirm-tray pattern next; the assistant that takes real actions ships last. Sprint-level detail is in [08-roadmap.md](08-roadmap.md) §3–§6.

| Phase | Features | Rationale |
|---|---|---|
| **MVP** (Sprints 5–8) | Summarization (§3.6), Natural-language search (§3.9) | Read-only or translate-to-deterministic-query — no write risk at all, and both need nothing that isn't already shipping in MVP (comments, board-level search) |
| **V1** (Sprints 9–16) | Automation suggestions (§3.4), Task generation (§3.1), Dashboard insights (§3.8), Meeting-to-task conversion (§3.7) | First features that create draft content or pre-fill a form a human still has to enable — each lands alongside the primitive it layers onto (automations, items, dashboards) rather than after it |
| **V2** | Project planning (§3.2), Workflow suggestions (§3.3), Risk detection (§3.5) | Deeper capabilities; risk detection specifically needs V2's workload + dependency data to be worth building, not a risk-aversion delay |
| **V2 late / Enterprise, ships last** | AI assistant for board management (§3.10) | Highest capability, highest risk (bulk writes) — ships only after the confirm-before-execute pattern has been proven across every earlier AI feature in this table |

---

*This completes the 4-stage Trellis blueprint alongside [10-security-compliance.md](10-security-compliance.md).*
