# Trellis — Product Blueprint Index

| | |
|---|---|
| **Product** | Trellis — an AI-powered, monday.com-style project management SaaS |
| **Document** | Index |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-10 |

This is the entry point to the full product blueprint: 10 documents built across 4 stages, meant to be read in order — each depends on the ones before it, and later docs cross-reference earlier ones by section number rather than repeating themselves.

**Where to start, by role:**
- **PM:** start at 01, then 08 and 09 for scope and sequencing.
- **Designer:** start at 01, then jump to 06 and 07 for UI structure and user journeys.
- **Engineer:** start at 02, then 03 and 04 for the system you're building; 05 if you're touching automations.
- **Security/compliance:** 10, cross-referencing 02 §8 and 03 §3–4 as needed.

---

## Stage 1 — Product Foundation

| Doc | Summary |
|---|---|
| [01-vision-and-scope.md](01-vision-and-scope.md) | Product vision, target users and use cases, competitive positioning, a complete feature breakdown, and the phased MVP / V1 / V2 / Enterprise scope — the free-for-now business model is defined here. |

## Stage 2 — Technical Spine

| Doc | Summary |
|---|---|
| [02-data-model.md](02-data-model.md) | The full PostgreSQL schema — every table, field, relationship, index, and scalability note, from `organizations` down to `audit_logs`. |
| [03-backend-architecture.md](03-backend-architecture.md) | System architecture: API structure, auth, multi-tenancy, real-time updates, background jobs, notifications, search, and the recommended tech stack with rationale for each choice. |
| [04-api-design.md](04-api-design.md) | The REST API v1 endpoint catalog, plus worked request/response examples for every core resource. |

## Stage 3 — Automation, Frontend & UX

| Doc | Summary |
|---|---|
| [05-automation-engine.md](05-automation-engine.md) | The trigger → condition → action automation model, 35 concrete example recipes, and the technical engine behind reliable, transparent, loop-safe execution. |
| [06-frontend-architecture.md](06-frontend-architecture.md) | Frontend tech stack, page and navigation structure, the board interface, every view type, drag-and-drop, and component architecture. |
| [07-ux-flows.md](07-ux-flows.md) | Ten step-by-step user journeys — onboarding, workspace/board setup, building an automation, inviting teammates vs. clients, dashboards, notifications. |
| [11-ui-design-system.md](11-ui-design-system.md) | The visual & interaction design layer: design tokens (color/type/space/elevation), surface-by-surface redesign specs (shell, home, table, kanban, item panel, automations, dashboards, AI), component inventory, animation system, and the phased UI build plan. |

## Stage 4 — Roadmap, Differentiation & Security

| Doc | Summary |
|---|---|
| [08-roadmap.md](08-roadmap.md) | A sprint-by-sprint build plan from MVP through Enterprise, with named milestones, a repeatable build-order principle, and exit criteria for each phase. |
| [09-differentiation-and-ai.md](09-differentiation-and-ai.md) | Competitive differentiation strategy and the AI feature set that's core to the product, from task generation to an AI assistant for board management. |
| [10-security-compliance.md](10-security-compliance.md) | Authentication, 2FA, SSO/SCIM, RBAC, encryption, backups, audit logs, and GDPR-compliant deletion/export — consolidated into one security reference. |

---

*Docs are versioned independently; check each file's header for its own status and last-updated date.*
