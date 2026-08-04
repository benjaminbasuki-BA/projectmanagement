# 03 — Backend Architecture

| | |
|---|---|
| **Product** | Trellis |
| **Document** | Stage 2 of 4 — Backend Architecture |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-10 |
| **Depends on** | [01-vision-and-scope.md](01-vision-and-scope.md), [02-data-model.md](02-data-model.md) |

---

## 1. Shape of the System

**A modular monolith in one TypeScript repo, deployed as three processes from one container image:**

```
                    ┌──────────────┐   ┌───────────────┐
   Browser/PWA ───► │  api          │   │  ws-gateway    │ ◄─── WebSocket
   Mobile (V2) ───► │  REST /v1     │   │  Socket.IO     │
   Public API  ───► │  (Fastify)    │   │  rooms/presence│
                    └──────┬───────┘   └───────▲───────┘
                           │ writes + outbox    │ fan-out
                    ┌──────▼──────────────────┐ │
                    │ PostgreSQL 16 (RDS)      │ │
                    └──────┬──────────────────┘ │
                           │ outbox relay        │
                    ┌──────▼──────────────────────────────┐
                    │ Redis 7: Streams (events) · BullMQ   │
                    │ (jobs) · cache · quotas · rate limits │
                    └──────┬──────────────────────────────┘
                    ┌──────▼───────┐
                    │  worker       │──► email (Postmark) · webhooks (egress)
                    │  BullMQ       │──► automations · search index · digests
                    └──────────────┘──► S3 (files) · Meilisearch (V1)
```

**Why a monolith:** a 6-engineer team cannot afford distributed-systems tax. Module boundaries (`auth`, `boards`, `items`, `automations`, `notifications`, `files`, `search`, `entitlements`, `integrations`, `ai`, `audit`) are enforced by lint rules (no cross-module imports except via each module's `index.ts` public interface). Anything can be extracted later because all cross-module async communication already goes through the outbox → Redis Streams path.

**The three deployables** (same image, different entrypoint):

| Process | Responsibility | Scaling signal |
|---|---|---|
| `api` | REST /v1, auth, uploads handshake, share-link pages | CPU / p95 latency |
| `ws-gateway` | WebSocket sessions, room fan-out, presence | concurrent connections (~20k/node) |
| `worker` | BullMQ consumers, outbox relay, cron | queue depth / age |

---

## 2. Recommended Tech Stack (with rationale)

| Layer | Choice | Rationale | Rejected alternative & why |
|---|---|---|---|
| Language | **TypeScript / Node.js 22 LTS** | One language across API, workers, WS, and the React frontend; shared Zod schemas end-to-end; easiest hiring pool | Go: better raw perf, but splits the team's language; Rails: weaker types, WS story heavier |
| HTTP framework | **Fastify** + Zod (`fastify-type-provider-zod`) | Fast, schema-first; request/response validation and the OpenAPI spec generated from the same Zod schemas doc 04 documents | NestJS: more structure than a 6-person team needs; Express: no schema story |
| ORM | **Drizzle ORM** + raw SQL for hot paths | SQL-shaped (no query-planner surprises), typed schema doubles as migration source | Prisma: heavier runtime, awkward for window functions/CTEs used in board queries |
| Database | **PostgreSQL 16 (RDS Multi-AZ)** | One database does relational + jsonb column_values + FTS (MVP search) + partitioning; boring and correct | MongoDB for column_values: loses transactions across items/values, which board ops need constantly |
| Cache / queues / events | **Redis 7 (ElastiCache)** — BullMQ, Streams, cache, counters | One infra piece serves four needs at our scale | Kafka: right at 100× volume, absurd ops cost now; SQS: no fan-out/consumer-groups combo |
| Real-time | **Socket.IO on `ws-gateway`** with Redis Streams adapter | Rooms, auto-reconnect, fallbacks for corporate proxies — client-portal visitors are on hostile networks | Raw `ws`: rebuild rooms/reconnect; managed (Pusher/Ably): per-message pricing fights the free model |
| Search | **Postgres FTS (MVP) → Meilisearch (V1)** | MVP: zero new infra. V1: typo-tolerance, faceting, < 60 s freshness SLA with simple ops (single binary) | Elasticsearch: ops burden; Algolia: per-record pricing vs. free product |
| AI / LLM | Provider-agnostic **`ai` module** wrapping a hosted LLM API (provider selected at implementation time; must support function-calling + structured output) | Ships from MVP — AI is pillar 4 (01 §1.1), not an afterthought. One wrapper module means switching providers or adding self-hosted inference later is a config change, not a codebase-wide rewrite (09 §4) | Calling a vendor SDK directly from every feature: cheap on day one, expensive to unwind once ten features depend on one vendor's exact API shape |
| File storage | **S3 + CloudFront (signed URLs)**, `imgproxy` for thumbnails, ClamAV container for AV | Presigned PUT keeps 100 MB uploads off the API; imgproxy renders thumbs on demand (no precompute storage) | Storing thumbnails: 3× storage cost for rarely-viewed sizes |
| Email | **Postmark** (transactional) + `react-email` templates | Best-in-class deliverability — notification email IS the product for client visitors | SES raw: deliverability babysitting the team can't staff |
| SSO/SCIM (ENT) | **WorkOS** | SAML+SCIM in days not months; per-connection pricing only when ENT phase starts | Building SAML in-house: classic small-team trap |
| Payments | **None now** (free-for-now). Future: Stripe behind `entitlements` | Decision from 01 §2.9 | — |
| Infra | **AWS: ECS Fargate, RDS, ElastiCache, S3/CloudFront, KMS, Secrets Manager**; Terraform; GitHub Actions CI/CD | SOC 2 evidence tooling, EU-region duplication (ENT data residency = second cell, same Terraform), no k8s tax | Fly/Render: lovely for MVP but a forced migration mid-V1; k8s: overkill |
| Observability | **Sentry** (errors) + **OpenTelemetry → Grafana Cloud** (metrics/logs/traces) | Managed, cheap at start; org_id/board_id as trace attributes (never PII) | Datadog: cost scales badly with a free product |

**Environments:** `dev` (docker-compose: postgres, redis, meilisearch, imgproxy, mailpit) · `staging` (scaled-down prod, seeded fixtures) · `prod`. EU residency later = a second full cell (`eu.trellis.app`) sharing only the marketing site and (future) billing.

---

## 3. API Structure & Authentication

### API structure

- **One API surface** at `https://api.trellis.app/v1` serves both the first-party app and public API consumers (doc 04 has the full design). No separate BFF — fewer layers, and the public API stays honest because we use it ourselves.
- First-party requests authenticate with **session cookies**; public/API requests with **PAT Bearer tokens**. Same handlers, same authorization; only rate-limit buckets differ (§9).
- OpenAPI 3.1 spec generated from Zod schemas in CI; published at `docs.trellis.app/api`.

### Authentication matrix

| Credential | For | Mechanics |
|---|---|---|
| Session cookie | Web app, PWA | Opaque 256-bit token, `httpOnly` `Secure` `SameSite=Lax`, 30-day rolling expiry. Hash stored in `sessions` (Postgres = truth, Redis = cache). CSRF: double-submit token on mutating routes |
| Password | login | argon2id (m=64 MiB, t=3, p=4); breach check against Pwned-passwords k-anonymity at signup/change |
| Google OAuth | login/signup | OIDC code flow; links to `users.google_sub` |
| 2FA | opt-in (MVP), enforced (ENT) | TOTP (RFC 6238), secret encrypted (KMS envelope), 10 one-time recovery codes |
| PAT | public API | `trl_pat_…` shown once; SHA-256 stored; scopes `read/write/admin`; per-token 600 req/min |
| Share-link token | client portal | `share.trellis.app/s/{token}`; optional password; commenters verify via 6-digit email code (10-min expiry, 5 attempts, then 15-min lockout) |
| iCal feed token | calendar subscribe | Per-view revocable token in URL |
| SAML/SCIM (ENT) | enterprise IdPs | via WorkOS; JIT-provision into `org_memberships` |

Login brute-force: 10 attempts / 15 min per (email, IP) sliding window in Redis, then exponential lockout + notification email.

## 4. Authorization & Multi-Tenancy

### Tenancy enforcement — two layers

1. **App layer:** every request resolves a `TenantContext {org_id, user_id, role}` in middleware; every Drizzle query builder is wrapped so tenant-owned tables **require** an `org_id` predicate (lint + runtime assert).
2. **Database layer (defense in depth):** Postgres RLS on all tenant tables — `USING (org_id = current_setting('app.org_id')::uuid)`; the pool sets `SET LOCAL app.org_id` per transaction. A cross-tenant leak now needs two independent bugs.

CI runs a **tenant-isolation test suite**: two seeded orgs, every endpoint fuzzed with org-B ids under org-A credentials, asserting 404 (never 403 — existence is not leaked).

### Permission resolution (implements 01 §2.8 / 02 §8)

```
can(user, action, resource):
  m = org_membership(org)                    # none → deny
  if m.role == 'admin'        → allow (except share-link scoping)
  if m.role == 'guest'        → require board_members row on that board
  workspace access: open → all members/viewers; closed → workspace_members
  board access:
    main      → workspace access grants board default level
    private/shareable → require board_members row
  level check: edit_everything > edit_content > edit_own > view_only
    edit_own → item.created_by == user OR user ∈ person-column assignees
  column visibility (ENT): filter response columns via columns.visibility
  viewers: cap at view_only + comment
```

**Caching:** resolved board-level grants cached in Redis as `authz:{user_id}:{board_id}` (60 s TTL) **stamped with `boards.permission_version`** — any permission change bumps the version (02 §2.3), instantly invalidating stale grants without cache scans. Share-link requests never touch this path; they resolve from `share_links` alone and serialize **only** `visible_column_ids`.

---

## 5. Real-Time Updates

- **Envelope:** `{seq, org_id, board_id, event_type, payload, actor_id, ts}` where `seq` = `boards.event_seq` (monotonic per board, incremented in the mutating transaction). Gap detection is therefore exact.
- **Rooms:** `board:{id}` (must pass authz on join), `user:{id}` (notifications badge), `dash:{id}` (widget refresh pings). WS upgrade authenticates via session cookie; share-link viewers join a `share:{link_id}` room that receives **column-whitelisted** payloads re-serialized per link.
- **Flow:** mutation commits (row + `outbox` + `event_seq++`) → outbox relay publishes to Redis Stream `events:{org_id}` → each `ws-gateway` node consumes (consumer group) and emits to local sockets.
- **Reconnect/resync:** client sends `last_seq` per board on reconnect. Gateway replays from `activity_events WHERE board_id = ? AND board_seq > ?` (indexed, 02 §5.3) if gap ≤ 500 events; otherwise instructs a full board refetch. This gives exactly-once *apparent* delivery over an at-least-once bus.
- **Presence:** Redis hash `presence:board:{id}` with 30 s heartbeat TTL; avatars only (no cursor tracking in V1).
- **Budgets:** mutation → subscriber paint p95 < 1 s; dashboards refresh < 5 s (Stage 1). Payloads are deltas (changed cells only), coalesced per 50 ms per board under burst.

## 6. Background Jobs & Automation Processing

### Queue catalog (BullMQ)

| Queue | Trigger | Concurrency | Retry policy |
|---|---|---|---|
| `automation-exec` | outbox events + scheduler | 20/worker | 3× exp backoff (10 s→5 m); then run logged `failed` + owner notified |
| `notification-fanout` | outbox events | 20 | 3× |
| `email-send` | fanout / digests | provider-rate-limited (Postmark 100/s) | 5×; DLQ |
| `webhook-delivery` | outbox events | 30 | retries at +30 s, +5 m, +30 m (Stage 1: 3 retries); counts `consecutive_failures`, disables at 100 |
| `search-index` | outbox events | batches of 500 docs | 3×; SLA < 60 s behind writes |
| `file-postprocess` | upload complete | 5 (ClamAV-bound) | 3×; stuck `pending` alarms at 10 min |
| `recurrence-scheduler` | cron `*/5 min` | 1 | scans `recurrences.next_run_at ≤ now()` (indexed), materializes items |
| `date-trigger-scanner` | cron `*/15 min` | 1 | scans `column_values.date_value` windows for `date_arrives` recipes & due-soon notifications |
| `digest-builder` | cron hourly | sharded by timezone | assembles hourly/daily digests per user tz |
| `retention-pruner` | cron daily 03:00 UTC | 1 | drops expired partitions; purges soft-deleted > 30 d; prunes notifications > 180 d |
| `export-import` | user request | 4 | CSV import/export, org export zip |

All jobs idempotent (keyed by `outbox.id` or entity id + version); DLQ per queue with Grafana alert at depth > 0 for 5 min.

### Automation engine (pillar 3: transparent)

1. **Match:** `automation-exec` consumes an event → loads the board's enabled recipes (Redis-cached by `(board_id, version)`) → matches trigger type/config.
2. **Gate:** entitlements check `INCR org:{id}:runs:{yyyymm}` vs 25,000 — over quota ⇒ run logged `quota_exceeded`, recipe paused (`disabled_reason`), owner notified. Nothing silently dropped.
3. **Evaluate:** conditions (≤ 3) against the item snapshot carried in the event (no re-read races).
4. **Execute:** actions sequentially; each mutation goes through the same domain services (so it emits outbox events, activity, real-time) with `chain_depth + 1`. Depth > 3 ⇒ halt, log `loop_stopped`, flag both recipes in the UI.
5. **Log always:** every attempt writes `automation_runs` (02 §6.2) — the "Automation activity" tab reads this table directly.
6. **Dry-run:** replays the last 7 days of `activity_events` through the matcher+conditions without executing: *"would have fired 14 times."*

Time-based triggers (`date_arrives`, `cron`) come from the two scanner crons, entering the same pipeline with a synthetic event.

## 7. Notification Service & File Storage

### Notification pipeline

`outbox event → notification-fanout`:
1. **Resolve recipients:** event-type rules (assignee, mentioned users/teams, comment-thread participants, item subscribers, board subscribers for opt-ins).
2. **Filter:** drop actor==recipient; board mutes; permission re-check (never notify someone about a board they lost access to); collapse duplicates within 5 min (same actor+item+type).
3. **Deliver:** insert `notifications` row → push on `user:{id}` WS room (badge) → email decision per `notification_preferences`: `instant` ⇒ `email-send` now; `hourly/daily` ⇒ picked up by `digest-builder` (marks `emailed_at` to prevent double-send).
4. Client-portal visitors get email-only notifications (comment replies on their thread) with the share link, per-link unsubscribe.

### File pipeline

1. `POST /v1/files` with `{filename, size_bytes, mime_type}` → entitlements check (100 MB/file, 20 GB/org **before** upload) + extension blocklist (01 §2.6) → returns S3 presigned PUT (15-min expiry, `content-length-range` enforced by S3 policy).
2. Client PUTs directly to S3 (uploads never transit the API).
3. `POST /v1/files/{id}/complete` → verifies object HEAD, computes sha256, enqueues `file-postprocess`: ClamAV scan (`pending → clean/infected`; infected ⇒ quarantined + uploader and org admins notified), image dimension extraction.
4. **Serving:** CloudFront signed URLs (15-min TTL) via `GET /v1/files/{id}/download-url`; bucket has zero public access. Thumbnails: imgproxy signed URLs generated on demand (`/rs:fit:320:240/…`), CloudFront-cached.
5. Deletes are soft (30 d) → purge job removes S3 objects; storage counter trigger per 02 §5.2.

## 8. Search & Audit Logging

### Search

- **MVP:** Postgres FTS — generated `tsvector` on `items.name` and `comments.body_text`, `websearch_to_tsquery`, always ANDed with accessible-board filter. Good enough for board-level `⌘K`.
- **V1 (global search):** Meilisearch indexes `items`, `comments`, `files`, `boards`, `users`. Documents carry `org_id`, `board_id`, denormalized filter fields (assignee ids, status label, dates). Indexer consumes the outbox stream (< 60 s freshness SLA, alerted). **Permission trim happens at query time:** API computes the caller's accessible `board_ids` (authz cache §4) and passes it as a Meili filter — search never returns even a title from a forbidden board (Stage 1 requirement). Full per-board reindex job for schema changes.

### Audit logging

- `audit` module exposes `audit.log(event, target, metadata)`; called from auth flows, admin actions, exports, share-link lifecycle — the 24-event catalog (01 §2.8). Middleware injects actor id + IP.
- Written **from day one** (ENT only unlocks the UI/API). Append-only table (02 §8), monthly partitions, 2-year retention, INSERT-only DB grant.
- ENT SIEM streaming = cursor-paged `GET /v1/audit-logs` (admin scope) — no push infra needed initially.

## 9. Rate Limiting, Webhooks & Integrations

### Rate limiting (Redis sliding-window Lua, fail-open on Redis outage, alarmed)

| Bucket | Limit | Key |
|---|---|---|
| Public API (PAT) | 600 req/min (01 §2.9) | `rl:pat:{token_id}` |
| Web session traffic | 100 req/10 s burst, 2,000/min sustained | `rl:sess:{session_id}` |
| Auth endpoints (login/signup/reset) | 10 /15 min | `rl:auth:{email}:{ip}` |
| Form submissions | 10 /min (01 §2.4) | `rl:form:{view_id}:{ip}` |
| Share-link email codes | 5 codes /h | `rl:code:{email}` |
| Search | 30 /min /user | `rl:search:{user_id}` |

Responses carry `X-RateLimit-Limit / -Remaining / -Reset`; 429s are `problem+json` with `Retry-After` (doc 04 §1).

### Webhook delivery (egress)

- Signature: `X-Trellis-Signature: t=<unix_ts>,v1=<hex hmac_sha256(secret, "{t}.{raw_body}")>`; receivers must reject `|now − t| > 5 min` (replay protection). Docs ship verification snippets.
- **SSRF hardening:** URL must be https, resolve to public IPs (checked at delivery, not just creation — DNS rebinding), ≤ 1 redirect (re-validated), 10 s timeout, response bodies capped at 64 KB (logged for debugging).
- Retry/disable policy per §6 queue table; `POST /webhooks/{id}/test` sends a signed `ping`.

### Integration handling

- Each provider is a module implementing `IntegrationProvider { connect(oauth), disconnect, healthcheck, actions{} }` — automations call `actions.slack.post_message(connection_id, …)` generically.
- Tokens encrypted AES-256-GCM with per-org KMS data keys; refresh handled centrally with jittered retry; `status='error'` connections surface in admin + recipe failure runs.
- Inbound (Slack interactivity, Zapier triggers) terminate at `/v1/integrations/{provider}/inbound` with per-provider signature verification. Zapier uses PATs against the public API — dogfooding it.
- Every outbound provider call `INCR`s the integration-actions quota (25k/mo) with the same pause+notify behavior as automations.

## 10. Error Monitoring, Backups & DR

### Observability

- **Sentry:** api/worker/ws + frontend, release-tagged, PII-scrubbed.
- **OTel → Grafana Cloud:** RED metrics per route/queue; traces sampled 10% (100% for p99 outliers); structured pino JSON logs with `request_id`/`org_id`.
- **SLOs (from Stage 1 budgets):** API p95 < 300 ms; WS delivery p95 < 1 s; search freshness < 60 s; automation trigger→action p95 < 5 s. Burn-rate alerts to on-call (PagerDuty free tier initially).
- Synthetic checks every 60 s on login, board load, share-link view (the wedge must never be down quietly).

### Backups & disaster recovery

| Asset | Mechanism | Targets |
|---|---|---|
| PostgreSQL | RDS Multi-AZ; PITR (35-day WAL); nightly snapshots; weekly snapshot copied cross-region | **RPO ≤ 5 min · RTO ≤ 4 h** |
| S3 files | Versioning + 30-day noncurrent retention; replication to second region from V1 | RPO ~ 15 min |
| Redis | Ephemeral by design — sessions fall back to Postgres, caches rebuild, quota counters reconcile nightly from `automation_runs`/`form_submissions` | RTO minutes |
| Meilisearch | Rebuildable from Postgres (full reindex ~hours); daily snapshot to S3 to shorten it | RTO < 1 h |
| Config/IaC | Terraform state (S3+lock); secrets in AWS Secrets Manager | — |

Quarterly **restore drills** (staging restored from prod snapshots, timed, documented — SOC 2 evidence). User-facing safety nets are separate: 30-day soft-delete recovery + admin org export (01 §2.8).

---

*Next: [04-api-design.md](04-api-design.md) — the /v1 surface in detail.*
