# 08 — Development Roadmap

| | |
|---|---|
| **Product** | Trellis |
| **Document** | Stage 4 of 4 — Roadmap |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-10 |
| **Depends on** | [01](01-vision-and-scope.md) §3 (phase definitions), [02](02-data-model.md)–[07](07-ux-flows.md) |

This document sequences the phases already defined in 01 §3 (MVP / V1 / V2 / Enterprise) into sprints with concrete deliverables and named milestones. It answers "what do we build in what order," not "what do we build" — that's docs 01–07.

---

## 1. Team & Operating Assumptions

- **Team:** 6 engineers (2 backend-leaning, 2 frontend-leaning, 1 floating/infra, 1 AI-focused), 1 product designer, 1 PM — the "6-engineer team" referenced throughout doc 03's and doc 06's stack rationale. The AI-focused engineer runs as a parallel track from Sprint 5 onward rather than a separate sequential phase, since AI is pillar 4 of the product (01 §1.1), not a post-launch add-on.
- **Cadence:** 2-week sprints, numbered continuously from Sprint 1.
- **Environments:** `dev` → `staging` → `prod`, per 03 §2, live from Sprint 1.
- Every phase below ends at the exit criteria already defined in 01 §3.1 — this doc adds the path to each.

## 2. The Build-Order Principle

Applied at every phase, not just once:

1. **Data model first** (02) — nothing else can start without tables, and schema is cheapest to change before anything depends on it.
2. **Backend core + auth** (03) — the API must exist before frontend has anything real to call; auth gates everything downstream.
3. **Frontend shell + core UI** (06) — built against the real (if minimal) API from day one, never mocks, to avoid integration debt discovered late.
4. **Automation / background systems** (05) — layered on once core mutations reliably emit outbox events; automations are consumers of a stable event stream, not a parallel system built in isolation.
5. **Testing hardening** — continuous (unit tests land with the code that needs them), but every phase-ending milestone has a dedicated hardening sprint, never a "we'll test it later" gap.
6. **Launch readiness** — observability, backups, docs — the last 1–2 sprints before any exit-criteria milestone is declared met.

---

## 3. MVP — Months 0–4 (Sprints 1–8)

**Goal (01 §3.1):** prove the core board UX with design partners. **Exit:** 20 design-partner teams, ≥ 40% week-4 retention, item-edit p95 < 300 ms.

### Sprints 1–2 (Weeks 1–4): Foundations
- **Backend:** monorepo scaffold (Turborepo/pnpm); Terraform base (VPC, RDS, ElastiCache, S3); CI/CD; `organizations` / `users` / `org_memberships` / `sessions` tables; auth module (signup, login, session cookies, argon2id) — 02 §1, 03 §3.
- **Frontend:** Vite scaffold; `packages/ui` bootstrap (Button, Input, Avatar, StatusChip); auth pages; app shell skeleton (06 §3).
- **Infra:** dev/staging docker-compose; Sentry wired.
- **Milestone:** *"Hello, authenticated board"* — a logged-in user lands in an empty workspace.

### Sprints 3–4 (Weeks 5–8): Core structure & items
- **Backend:** `workspaces`, `boards`, `board_groups`, `columns` (8 MVP types), `items`, `column_values` (02 §2–3); full REST CRUD for all of the above (04 §2.3–2.5); `outbox` table exists, consumer still minimal.
- **Frontend:** workspace home, board creation flow, Table view with inline cell editing (no virtualization yet), column add/edit UI (06 §5, §7).
- **Milestone:** *"Create a board, add items, edit cells"* — the core loop, end to end.

### Sprints 5–6 (Weeks 9–12): Views, collaboration, real-time
- **Backend:** Kanban queries; `views` (saved views); `comments`; `activity_events`; `files` + `attachments` (upload pipeline, ClamAV); `notifications` + fanout; `ws-gateway` stood up (Socket.IO rooms, outbox relay, 03 §5–7).
- **Frontend:** Kanban view; item detail slide-over (Updates/Files/Activity tabs); TanStack Virtual added to Table (target: smooth at 20k items); notification bell; live cell updates wired end to end.
- **AI (parallel, 6th engineer):** `ai` module scaffold wrapping the chosen LLM provider (03 §2); Updates-thread summarization wired into the item panel (09 §3.6) — deliberately the first AI feature, since it's read-only and needs nothing but comments that already exist.
- **Milestone:** *"Two people editing the same board see each other live."*

### Sprints 7–8 (Weeks 13–16): Search, templates, mobile polish, private beta launch
- **Backend:** Postgres FTS search; 6 starter templates seeded; `audit_logs` writer wired in from day one even though the viewing UI is Enterprise-only (02 §8 — cheap now, expensive to retrofit); CSV import/export.
- **Frontend:** `⌘K` command palette; template gallery (browse-only); responsive breakpoints down to mobile card view + My Work screen (06 §12).
- **AI:** natural-language search layered on the Postgres FTS shipped this sprint, translating queries into the existing filter DSL (09 §3.9, 04 §3.10); `ai_interactions` logging live from day one (02 §6.6) so V1/V2 AI prioritization is backed by real usage data, not guesswork.
- **Testing:** first full regression pass — Playwright e2e on the core loop; tenant-isolation fuzz suite (03 §4) run for the first time, then on every PR thereafter.
- **Launch ops:** PM onboards 20 design partners manually; feedback loop is a shared Trellis board tracking their bugs (dogfooding from day one).
- **Exit gate:** 20 design-partner teams active, ≥ 40% week-4 retention, item-edit p95 < 300 ms — measured on the Grafana SLO dashboards stood up this sprint.

---

## 4. V1 — Months 5–9 (Sprints 9–18)

**Goal:** public launch with the client-access wedge. **Exit:** 500 weekly-active teams, ≥ 25% of active boards using a share link or guest.

### Sprints 9–11 (Weeks 17–22): Automation engine
- **Backend:** `automations` / `automation_runs`; the `entitlements` module wired everywhere a fair-use check applies (02 §9); BullMQ `automation-exec` queue; trigger matcher, condition evaluator, action-handler registry, chain-depth loop guard, dry-run endpoint (05 §10).
- **Frontend:** automation builder (3-step form), recipe library browser, Automation Activity tab (06 §10).
- **AI (parallel):** automation-suggestion generator reading `activity_events` and proposing recipes in the exact trigger/condition/action shape the engine built this sprint already executes (09 §3.4); `ai_drafts` table (02 §6.6) built to back it and the item-generation features below.
- **Milestone:** *"A recipe fires reliably and every run is logged."*

### Sprints 12–14 (Weeks 23–28): Client access, forms, dashboards — the differentiator
- **Backend:** `board_members` permission levels; `share_links` + `share_link_visitors` (email-code verification); `views` type `form` + `form_submissions`; `dashboards` / `widgets`.
- **Frontend:** Share panel; client-portal shell (`/s/{token}`, zero app chrome); guest-audit page; form builder + public renderer; dashboard builder with the 6 MVP widget types (06 §8–9).
- **AI (parallel):** task generation (`generate-from-brief`, 04 §2.13) and dashboard-widget insight narration (09 §3.8) — both land alongside the primitives they layer onto (items, dashboards) rather than after them.
- **Milestone:** *"Send a client a link; they comment without creating an account."* Treat this as the phase's true north — validate it directly with 2–3 design-partner agencies, not just internally.

### Sprints 15–16 (Weeks 29–32): Depth features
- **Backend:** subitems (`parent_item_id`), `time_entries`, `recurrences` + scheduler, finish-to-start `dependency` column, Timeline/Calendar view queries, `teams`, `folders`.
- **Frontend:** Timeline/Gantt view, Calendar view, subitem rollups in the item panel, time-tracking timer UI, recurrence config UI.
- **AI (parallel):** meeting-to-task conversion (09 §3.7), completing the V1 AI feature set.
- **Milestone:** *"A full agency retainer runs on one board with subitems, dates, and a Gantt."*

### Sprints 17–18 (Weeks 33–36): Public API, integrations, hardening, launch
- **Backend:** `api_tokens`; hardened public REST surface (rate limiting live, OpenAPI spec published); `webhooks` / `webhook_deliveries`; Slack, Google Drive, Zapier `IntegrationProvider` modules (03 §9); Meilisearch stood up for global search.
- **Frontend:** API token management page, integrations settings, global search UI.
- **Testing:** load test to the V1 exit target (500-weekly-active-team synthetic load); internal security review (auth flows, RLS, webhook SSRF hardening — cross-ref [10](10-security-compliance.md)); full Playwright suite covering automations, the client portal, and the AI accept/discard flow (a draft must never bypass the normal write path, 09 §2).
- **Launch ops:** open signup flips on; help-center content written; synthetic uptime checks live on login, board-load, share-link-view (03 §10).
- **Exit gate:** 500 weekly-active teams, ≥ 25% of active boards using a share link or guest.

---

## 5. V2 — Months 10–18 (Sprints 19–36)

**Goal:** scale, mobile, depth. **Exit:** 5,000 weekly-active teams, ≥ 40% month-3 retention, native apps ≥ 4.5★.

| Sprints | Months | Focus | Key deliverables |
|---|---|---|---|
| 19–22 | 10–11 | Advanced columns + workload | `formula` expression engine, `connect_boards` + `mirror`, `auto_number`, workload capacity grid. **AI:** risk-detection foundations begin now that workload/dependency data exists to reason over (09 §3.5) |
| 23–26 | 12–13 | Native mobile foundation | React Native scaffold (`apps/mobile`, sharing `packages/schemas` + design tokens), offline read cache, push, My Work + board view ported first (not full parity) — iOS/Android beta in TestFlight/Play internal track. **AI:** project planning (09 §3.2) — full board drafts from a text brief, reusing the same template-instantiation path as static templates (04 §2.4) |
| 27–30 | 14–15 | Automation & dependency depth | Multi-step actions (≤ 5), cross-board actions, `call_webhook` action (05 §7–8 recipes go live), all 4 dependency types + auto-shift modes, critical path, Gantt export. **AI:** ambient workflow-suggestion cards (09 §3.3), reusing the event-history read path built for automation suggestions in V1 |
| 31–34 | 16–17 | Integrations + dashboard depth | GitHub, Teams+Outlook, 2-way Google Calendar, Make; dashboards to 12+ widgets, client-shareable dashboard links, 50-board portfolio dashboards. **AI:** risk detection reaches GA (09 §3.5); dashboard insights extended to the new widget types |
| 35–36 | 18 | i18n + mobile GA + hardening | 5 languages (ES/FR/DE/PT/NL), OAuth 2.0 for third-party apps, workspace templates. **AI:** assistant beta (09 §3.10) — the highest-risk AI feature, gated behind the confirm-step pattern every earlier AI feature this phase has already proven out |

Sprints 31–34 deliberately overlap the start of the Enterprise track (§6) — both need work on the org-admin settings surface concurrently, so scheduling them adjacent avoids two teams touching the same screens in sequence.

**Exit gate:** 5,000 weekly-active teams, ≥ 40% month-3 team retention, native apps ≥ 4.5★.

---

## 6. Enterprise — Months 16–24 (overlapping V2)

Staffed as a **dedicated 1.5–2 engineer track pulled from the 6**, starting month 16 — not a fully sequential phase, matching the overlap already stated in 01 §3.1.

| Months | Focus |
|---|---|
| 16–18 | WorkOS-mediated SSO/SCIM (Okta, Azure AD, Google Workspace), enforced 2FA, domain capture — WorkOS was chosen specifically in 03 §2 to make this a days-not-months lift |
| 19–21 | Audit log **UI** (the data has existed since MVP, 02 §8 — this is "a UI project, not a data project," 03 §8), column-level permissions, status-transition restrictions, IP allowlist, session policies |
| 22–24 | SOC 2 Type II audit engagement (evidence collection automated from the backup-drill + audit-log infrastructure already running since MVP), EU data-residency cell, custom retention policies, white-label client views, AI assistant general availability (09 §3.10) once its confirm-step pattern has been validated across every V2 AI feature above |

**Exit gate:** SOC 2 Type II report issued, 5 organizations running at 100+ seats, SSO/SCIM/audit log generally available.

---

## 7. Cross-Phase: Testing Strategy

| Layer | Cadence | Notes |
|---|---|---|
| Unit tests | Every PR, sprint 1 onward | CI gate: no merge without coverage on new code |
| Tenant-isolation fuzz suite | Every PR, sprint 4 onward | The single highest-value test given the multi-tenant model (03 §4) |
| E2E (Playwright) | Core loop from sprint 8; automations + client portal + multiplayer editing added through V1 | Multi-context Playwright required for real-time collaboration tests (06 §1) |
| Load testing | Staged before every phase's launch milestone | Targeted at that phase's exit-criteria user count |
| Security review | Internal before V1 launch; external pentest before the Enterprise SOC 2 engagement | Detailed in [10-security-compliance.md](10-security-compliance.md) |
| Restore drills | Quarterly, starting the moment RDS PITR is live (sprint 2) | Doesn't wait for Enterprise — cheap now, de-risks the whole timeline (03 §10) |

## 8. Cross-Phase: Launch Readiness Checklist

Run at the end of every phase, before declaring its exit criteria met:

- [ ] Grafana SLO dashboards reflect the phase's stated latency/freshness budgets (01 §1.1)
- [ ] Synthetic checks live for the phase's critical user path
- [ ] Backup/restore drill completed in the last 30 days
- [ ] Help-center content covers every new surface shipped this phase
- [ ] Fair-use usage meters visible in admin for any new quota introduced (02 §9)
- [ ] Changelog published

---

*This is the final document in the 4-stage blueprint. Docs 01–10 together form the build-ready spec — see [09-differentiation-and-ai.md](09-differentiation-and-ai.md) and [10-security-compliance.md](10-security-compliance.md) for the remaining Stage 4 material.*
