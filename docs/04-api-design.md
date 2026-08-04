# 04 — API Design

| | |
|---|---|
| **Product** | Trellis |
| **Document** | Stage 2 of 4 — REST API v1 |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-10 |
| **Depends on** | [02-data-model.md](02-data-model.md), [03-backend-architecture.md](03-backend-architecture.md) |

**Style decision: REST, not GraphQL.** One surface serves the first-party app and public consumers; REST pairs naturally with webhooks and PAT scopes, is cacheable, and is what Zapier-class integrators expect. GraphQL is re-evaluated post-V2 (per Stage 1).

---

## 1. Conventions

| Concern | Rule |
|---|---|
| Base URL | `https://api.trellis.app/v1` (path-versioned; breaking changes ⇒ `/v2` + 12-month deprecation headers) |
| Auth | `Authorization: Bearer trl_pat_…` (public) or session cookie + `X-CSRF-Token` (first-party) |
| IDs | UUIDv7 strings; items also expose `display_id` (`"TRL-1042"`) — accepted interchangeably in `/items/{id}` |
| Timestamps | ISO 8601 UTC (`2026-07-10T14:32:05Z`) |
| Pagination | Cursor: `?limit=50&cursor=…` (default 50, max 200); responses end with `"next_cursor": "…" \| null` |
| Sorting | `?sort=-created_at,name` (max 3 keys, `-` = desc) |
| Sparse responses | `?include=column_values,subitems` — heavy fields are opt-in on list endpoints |
| Idempotency | `Idempotency-Key: <uuid>` honored on all POSTs for 24 h (returns the original response) |
| Errors | RFC 9457 `application/problem+json` (see §4) |
| Rate limits | Per 03 §9; every response carries `X-RateLimit-Limit/-Remaining/-Reset` |
| Writes echo | Mutations return the full updated resource — clients never need a follow-up GET |
| Scopes | Each endpoint lists the minimum PAT scope: `read`, `write`, or `admin` |

---

## 2. Endpoint Catalog

### 2.1 Auth (session-based; PATs cannot call these)

| Method & path | Purpose |
|---|---|
| `POST /auth/signup` | Email+password signup; sends verification email |
| `POST /auth/login` | Password login; returns session cookie; `202` + `challenge` if 2FA enabled |
| `POST /auth/2fa/verify` | Complete a 2FA challenge |
| `POST /auth/logout` | Revoke current session |
| `GET /auth/sessions` · `DELETE /auth/sessions` · `DELETE /auth/sessions/{id}` | List / revoke-all ("sign out everywhere") / revoke one |
| `POST /auth/password/reset-request` · `POST /auth/password/reset` | Reset flow (token emailed, 30-min expiry) |
| `GET /auth/oauth/google` → `/auth/oauth/google/callback` | OIDC code flow |
| `POST /auth/2fa/enable` · `POST /auth/2fa/confirm` · `DELETE /auth/2fa` | TOTP lifecycle (confirm returns recovery codes once) |

### 2.2 Users & org

| Method & path | Scope | Purpose |
|---|---|---|
| `GET /users/me` | read | Profile + org memberships |
| `PATCH /users/me` | write | name, timezone, locale, avatar_file_id |
| `GET /users/me/notification-preferences` · `PUT …` | read/write | Cadence, DND, per-event overrides |
| `GET /users?query=` | read | Org directory (guests see only co-members of shared boards) |
| `GET /org` · `PATCH /org` | read/admin | Org settings |
| `POST /org/invites` | admin* | `{email, role}`; *members may invite if org setting allows |
| `GET /org/members?role=guest` | read | Membership list; `role=guest` powers the guest-audit page |
| `PATCH /org/members/{id}` · `DELETE /org/members/{id}` | admin | Change role / deactivate |
| `GET /org/usage` | admin | Fair-use meters: storage, automation runs, integration actions, form submissions |
| `GET /org/audit-logs?event=&actor_id=&from=&to=` | admin | ENT phase; cursor-paged SIEM feed |

### 2.3 Workspaces, folders, teams

| Method & path | Scope |
|---|---|
| `GET /workspaces` · `POST /workspaces` · `GET/PATCH/DELETE /workspaces/{id}` | read/write |
| `GET /workspaces/{id}/members` · `PUT /workspaces/{id}/members/{user_id}` · `DELETE …` | write |
| `GET /workspaces/{id}/folders` · `POST /workspaces/{id}/folders` · `PATCH/DELETE /folders/{id}` | write |
| `GET /teams` · `POST /teams` · `PATCH/DELETE /teams/{id}` · `PUT/DELETE /teams/{id}/members/{user_id}` | write/admin |

### 2.4 Boards, groups, columns

| Method & path | Scope | Notes |
|---|---|---|
| `GET /workspaces/{id}/boards` | read | Excludes archived unless `?state=archived` |
| `POST /workspaces/{id}/boards` | write | `{name, type, folder_id?, template_id?}` — template instantiation |
| `GET /boards/{id}` | read | `?include=groups,columns,views` |
| `PATCH /boards/{id}` · `DELETE /boards/{id}` | write | Delete = soft (30-day recovery) |
| `POST /boards/{id}/archive` · `POST /boards/{id}/unarchive` · `POST /boards/{id}/duplicate` | write | duplicate: `{include_items: bool}` |
| `GET /boards/{id}/members` · `PUT /boards/{id}/members/{user_id}` | write | `{permission_level}` per 01 §2.8 |
| `GET /boards/{id}/activity?since_seq=&cursor=` | read | Activity feed + real-time resync (03 §5) |
| `GET /boards/{id}/groups` · `POST /boards/{id}/groups` · `PATCH/DELETE /groups/{id}` | write | PATCH takes `{title?, color?, position?}` |
| `GET /boards/{id}/columns` · `POST /boards/{id}/columns` | write | 50-column limit ⇒ `422 column_limit_reached` |
| `PATCH /columns/{id}` · `DELETE /columns/{id}` | write | Type change rejected except `text→long_text` |
| `GET /templates?category=` · `POST /boards/{id}/save-as-template` | read/write | Starter + custom templates |

### 2.5 Items & subitems

| Method & path | Scope | Notes |
|---|---|---|
| `GET /boards/{id}/items` | read | `?filter=` (§3.4), `?group_id=`, `?include=column_values,subitems`, cursor-paged |
| `POST /boards/{id}/items` | write | `{name, group_id?, column_values?, position?: {after_item_id}}` |
| `GET /items/{id}` | read | Full hydration incl. column_values |
| `PATCH /items/{id}` | write | `{name?, position?}` |
| `PATCH /items/{id}/column-values` | write | Partial cell update — the hot path (§3.3) |
| `POST /items/{id}/move` | write | `{board_id?, group_id, column_mapping?}` — cross-board move prompts mapping |
| `POST /items/{id}/duplicate` · `POST /items/{id}/archive` · `DELETE /items/{id}` | write | |
| `GET /items/{id}/subitems` · `POST /items/{id}/subitems` | read/write | 100-subitem limit ⇒ 422 |
| `POST /boards/{id}/items/batch` | write | ≤ 500 ops (§3.5) |
| `GET /me/items?bucket=today\|week\|overdue` | read | "My Work" across boards |
| `PUT /items/{id}/recurrence` · `DELETE …` | write | Fields per 02 §3.6 |
| `GET /items/{id}/time-entries` · `POST …` · `PATCH/DELETE /time-entries/{id}` · `POST /items/{id}/time-entries/start` · `POST …/stop` | write | Timer endpoints enforce one-running-timer |

### 2.6 Views, share links, forms

| Method & path | Scope | Notes |
|---|---|---|
| `GET /boards/{id}/views` · `POST /boards/{id}/views` · `PATCH/DELETE /views/{id}` | write | `settings` schema per 02 §4.1 |
| `POST /views/{id}/share-links` | write | `{mode, visible_column_ids, expires_at?, password?}` → returns URL **once** |
| `GET /boards/{id}/share-links` · `DELETE /share-links/{id}` | write | Revoke immediately kills the token |
| `GET /forms/{slug}` *(unauthenticated)* | — | Public form definition |
| `POST /forms/{slug}/submissions` *(unauthenticated)* | — | CAPTCHA + 10/min/IP; creates item |

### 2.7 Comments (updates)

| Method & path | Scope |
|---|---|
| `GET /items/{id}/comments` · `POST /items/{id}/comments` | read/write |
| `PATCH /comments/{id}` · `DELETE /comments/{id}` | write |
| `PUT /comments/{id}/reactions/{emoji}` · `DELETE …` | write |

### 2.8 Files

| Method & path | Scope | Notes |
|---|---|---|
| `POST /files` | write | Returns presigned PUT (03 §7); quota checked here |
| `POST /files/{id}/complete` | write | Finalize; triggers scan |
| `GET /files/{id}` · `GET /files/{id}/download-url` | read | Metadata / 15-min signed URL (403 while `scan_status=pending`) |
| `DELETE /files/{id}` | write | Soft, 30-day |

### 2.9 Automations

| Method & path | Scope | Notes |
|---|---|---|
| `GET /boards/{id}/automations` · `POST /boards/{id}/automations` | write | trigger/conditions/actions per 02 §6.1 |
| `PATCH /automations/{id}` · `DELETE /automations/{id}` | write | `{enabled: false}` pauses |
| `POST /automations/{id}/dry-run` | write | Replays last 7 days (03 §6) |
| `GET /automations/{id}/runs` · `GET /boards/{id}/automation-runs?status=failed` | read | The transparency tab |
| `GET /automation-recipes` | read | Curated ~25-recipe library metadata |

### 2.10 Dashboards & widgets

| Method & path | Scope |
|---|---|
| `GET /workspaces/{id}/dashboards` · `POST …` · `GET/PATCH/DELETE /dashboards/{id}` | read/write |
| `POST /dashboards/{id}/widgets` · `PATCH/DELETE /widgets/{id}` | write |
| `GET /widgets/{id}/data` | read | Evaluated with the **caller's** permissions (03 §4) |

### 2.11 Notifications

| Method & path | Scope |
|---|---|
| `GET /notifications?unread=true` · `GET /notifications/unread-count` | read |
| `POST /notifications/mark-read` `{ids:[…]}` · `POST /notifications/mark-all-read` | write |
| `PUT /boards/{id}/mute` · `DELETE /boards/{id}/mute` | write |

### 2.12 Integrations & webhooks

| Method & path | Scope | Notes |
|---|---|---|
| `GET /integrations` | read | Available providers + this org's connections |
| `POST /integrations/{provider}/connect` | admin | Returns OAuth redirect URL |
| `DELETE /integrations/connections/{id}` | admin | |
| `GET /webhooks` · `POST /webhooks` · `PATCH/DELETE /webhooks/{id}` | admin | `{board_id, url, events[], column_filter_id?}` — secret returned once |
| `GET /webhooks/{id}/deliveries` · `POST /webhooks/{id}/test` | admin | 30-day delivery log; signed `ping` |
| `GET /search?q=&scope=items,comments&workspace_id=` | read | Global search (V1) |

### 2.13 AI

| Method & path | Scope | Notes |
|---|---|---|
| `GET /search?q=&nl=true` | read | Natural-language mode (MVP) — parses `q` into the standard `filter` DSL (§3.4) and returns both the results and the parsed filter, so the translation is always visible (09 §3.9) |
| `POST /items/{id}/comments/summarize` | read | Summarizes the item's Updates thread (MVP, 09 §3.6) |
| `POST /boards/{id}/items/generate-from-brief` | write | `{brief_text}` → returns an `ai_drafts` row (02 §6.6), not created items — see §3.11 |
| `POST /ai-drafts/{id}/accept` · `POST /ai-drafts/{id}/discard` | write | Confirms or discards a pending AI draft; accept calls the identical `POST /items` path a manual create uses |
| `GET /boards/{id}/automation-suggestions` | read | AI-generated recipe suggestions from event history (V1, 09 §3.4) — each is a valid, unsaved `automations` payload (05 §1) |
| `POST /widgets/{id}/insight` | read | One-line narration over the widget's already-fetched data (V1, 09 §3.8) |
| `POST /boards/{id}/items/from-meeting-notes` | write | `{notes_text}` → `ai_drafts`, same accept/discard flow as brief-based generation (V1, 09 §3.7) |
| `POST /boards/{id}/ai-plan` | write | `{description, target_end_date, team_size?}` → a draft board structure (V2, 09 §3.2) |
| `POST /assistant/messages` | write | Conversational board-management assistant (V2/ENT, 09 §3.10) — any response proposing a mutation returns a `pending_action` requiring a separate `POST /assistant/actions/{id}/confirm` |

Every write-shaped AI endpoint follows the same pattern: the AI call itself never mutates board data — it produces a draft or a pending action that a separate, explicit confirm call executes through the normal domain services (09 §2).

---

## 3. Worked Examples (core flows)

### 3.1 Login

```http
POST /v1/auth/login
{ "email": "priya@northpeak.agency", "password": "•••••••••••" }
```
`200` (sets `trellis_session` cookie) — or `202 { "challenge": "totp", "challenge_token": "chal_9f…" }` when 2FA is on:
```json
{
  "user": { "id": "0197a2b4-…", "name": "Priya Raman", "email": "priya@northpeak.agency", "timezone": "Europe/Amsterdam" },
  "orgs": [ { "id": "0197a2b0-…", "slug": "northpeak-agency", "name": "Northpeak Agency", "role": "admin" } ]
}
```

### 3.2 Create an item (with cell values)

```http
POST /v1/boards/0197b1c0-…/items
Idempotency-Key: 7c9e6679-7425-40de-944b-e07fc1f90ae7

{
  "name": "Homepage hero design",
  "group_id": "0197b1c4-…",
  "column_values": {
    "0197b1c9-…": { "label_id": "lbl_wip" },
    "0197b1ca-…": { "user_ids": ["0197a2b4-…"] },
    "0197b1cb-…": { "date": "2026-07-18", "time": null }
  }
}
```
`201`:
```json
{
  "id": "0197b2d1-…",
  "display_id": "TRL-1042",
  "name": "Homepage hero design",
  "board_id": "0197b1c0-…",
  "group_id": "0197b1c4-…",
  "position": "a0m",
  "created_by": "0197a2b4-…",
  "created_at": "2026-07-10T14:32:05Z",
  "column_values": {
    "0197b1c9-…": { "type": "status", "label_id": "lbl_wip", "label": "Working on it", "color": "#FDAB3D", "is_done": false },
    "0197b1ca-…": { "type": "person", "user_ids": ["0197a2b4-…"], "users": [{ "id": "0197a2b4-…", "name": "Priya Raman" }] },
    "0197b1cb-…": { "type": "date", "date": "2026-07-18", "time": null, "overdue": false }
  },
  "subitem_summary": { "total": 0, "done": 0 }
}
```
Responses are **hydrated** (label text, user names) so clients render without joins; writes accept only canonical ids (02 Appendix A).

### 3.3 Change a status (the hot path)

```http
PATCH /v1/items/0197b2d1-…/column-values
{ "0197b1c9-…": { "label_id": "lbl_done" } }
```
`200` returns the full item (as §3.2). Side effects (one transaction + outbox): activity event, `board_seq++` real-time delta, automation triggers, webhook `column_value.changed`.

### 3.4 List items with a filter

`filter` is URL-encoded JSON, same shape as saved-view filters (02 §4.1):

```http
GET /v1/boards/0197b1c0-…/items
    ?filter={"op":"and","rules":[
        {"column_id":"0197b1c9-…","cmp":"is_none_of","value":["lbl_done"]},
        {"column_id":"0197b1cb-…","cmp":"next_n_days","value":7},
        {"column_id":"0197b1ca-…","cmp":"is_me"}]}
    &sort=-0197b1cb-…&limit=50&include=column_values
```
`200`: `{ "items": [ … ], "next_cursor": "eyJvZmZzZXQi…", "total_matching": 12 }`

Comparators: text `contains·is·is_empty`; number `eq·neq·gt·lt·between`; date `is·before·after·last_n_days·next_n_days·overdue`; status/dropdown `is_any_of·is_none_of`; person `is_any_of·is_me·is_empty` (01 §2.3).

### 3.5 Batch edit (≤ 500 ops)

```http
POST /v1/boards/0197b1c0-…/items/batch
{ "operations": [
    { "op": "set_column_values", "item_ids": ["0197b2d1-…","0197b2d2-…"], "column_values": { "0197b1c9-…": { "label_id": "lbl_done" } } },
    { "op": "move_to_group", "item_ids": ["0197b2d3-…"], "group_id": "0197b1c5-…" } ] }
```
`200`: `{ "succeeded": 3, "failed": 0, "results": [ … ] }` — partial failure reports per item, no all-or-nothing rollback.

### 3.6 Post a comment with a mention

```http
POST /v1/items/0197b2d1-…/comments
{ "body": { "type": "doc", "content": [ { "type": "paragraph", "content": [
      { "type": "mention", "attrs": { "user_id": "0197a2c0-…" } },
      { "type": "text", "text": " can you review the hero copy?" } ] } ] } }
```
`201` returns the comment with `author`, hydrated mentions, `reactions: []`. The mention subscribes the user and notifies them (03 §7).

### 3.7 File upload (3 steps)

```http
POST /v1/files            { "filename": "hero-v2.png", "size_bytes": 4183040, "mime_type": "image/png" }
→ 201 { "id": "0197c0aa-…", "upload": { "method": "PUT", "url": "https://uploads.s3…?X-Amz-Signature=…", "expires_at": "…" } }

PUT <upload.url>          (raw bytes, direct to S3)

POST /v1/files/0197c0aa-…/complete
→ 200 { "id": "0197c0aa-…", "scan_status": "pending", "thumbnail_url": null }
```
Over quota ⇒ step 1 fails `422 storage_quota_exceeded` with current usage in `errors[]`.

### 3.8 Create an automation

```http
POST /v1/boards/0197b1c0-…/automations
{ "trigger":    { "type": "status_changed", "column_id": "0197b1c9-…", "to_label_id": "lbl_stuck" },
  "conditions": [ { "column_id": "0197b1ca-…", "cmp": "is_not_empty" } ],
  "actions":    [ { "type": "notify", "target": "board_owner", "message": "{item.name} is stuck" } ] }
```
`201` returns the recipe with `enabled: true`, generated `name`. A run object (from `GET /automations/{id}/runs`):
```json
{ "id": "0197c3f2-…", "status": "succeeded", "trigger_item_id": "0197b2d1-…",
  "chain_depth": 0, "started_at": "2026-07-10T15:02:11Z", "duration_ms": 48,
  "trigger_snapshot": { "event": "column_value.changed", "to": { "label_id": "lbl_stuck" } },
  "actions_log": [ { "type": "notify", "ok": true, "ms": 12 } ] }
```

### 3.9 Webhook delivery (what your endpoint receives)

```http
POST https://example.com/hooks/trellis
X-Trellis-Signature: t=1783090330,v1=5257a869e7…
X-Trellis-Event: column_value.changed
X-Trellis-Delivery: 0197c4d0-…

{ "event": "column_value.changed",
  "org_id": "0197a2b0-…", "board_id": "0197b1c0-…", "item_id": "0197b2d1-…",
  "column_id": "0197b1c9-…",
  "from": { "label_id": "lbl_wip" }, "to": { "label_id": "lbl_done" },
  "actor": { "type": "user", "id": "0197a2b4-…" },
  "occurred_at": "2026-07-10T15:02:11Z" }
```
Respond `2xx` within 10 s; retries at +30 s/+5 m/+30 m; 100 consecutive failures disables the webhook (owner notified).

### 3.10 Natural-language search

```http
GET /v1/search?q=things%20Priya%20is%20behind%20on&nl=true&workspace_id=0197a2b0-…
```
`200`:
```json
{
  "parsed_filter": { "op": "and", "rules": [
      { "column_id": "0197b1ca-…", "cmp": "is_any_of", "value": ["0197a2c0-…"] },
      { "column_id": "0197b1cb-…", "cmp": "overdue" } ] },
  "parsed_summary": "Owner is Priya Raman AND Due date is overdue",
  "results": { "items": [ { "id": "0197b2d1-…", "display_id": "TRL-1042", "name": "Homepage hero design", "board_name": "Acme — Website Redesign" } ], "next_cursor": null }
}
```
`parsed_filter`/`parsed_summary` are always returned alongside results (09 §3.9) — a user sees exactly what the AI understood, and `parsed_filter` is itself a valid `filter` payload (§3.4) droppable straight into a saved view.

### 3.11 Task generation (draft, not created)

```http
POST /v1/boards/0197b1c0-…/items/generate-from-brief
{ "brief_text": "Redesign homepage for Acme, due in 6 weeks" }
```
`201`:
```json
{
  "draft_id": "0197d1a0-…",
  "kind": "draft_items",
  "status": "pending",
  "payload": { "items": [
      { "name": "Wireframes", "column_values": { "0197b1cd-…": { "option_ids": ["opt_discovery"] }, "0197b1cb-…": { "date": "2026-07-17" } } },
      { "name": "Copywriting", "column_values": { "0197b1cd-…": { "option_ids": ["opt_design"] }, "0197b1cb-…": { "date": "2026-07-24" } } },
      { "name": "Client review", "column_values": { "0197b1cd-…": { "option_ids": ["opt_qa"] }, "0197b1cb-…": { "date": "2026-08-14" } } } ] },
  "expires_at": "2026-07-17T14:32:05Z"
}
```
Nothing is created yet. `POST /v1/ai-drafts/0197d1a0-…/accept` (optionally with an edited `payload`) creates the items via the normal per-item `POST /items` path — indistinguishable in the activity log from a manual bulk-create, except `metadata.via = "ai_assistant"` (02 §5.3).

---

## 4. Errors (RFC 9457)

```json
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json

{ "type": "https://docs.trellis.app/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "detail": "2 fields are invalid.",
  "request_id": "req_9f3k2m…",
  "errors": [
    { "field": "column_values.0197b1cb-….date", "code": "invalid_date", "message": "Expected YYYY-MM-DD." },
    { "field": "name", "code": "too_long", "message": "Max 255 characters." } ] }
```

| Status | `type` slug (suffix of docs URL) | When |
|---|---|---|
| 400 | `malformed-request` | Bad JSON, unknown params |
| 401 | `unauthenticated` | Missing/expired credential |
| 403 | `forbidden` | Authenticated but not allowed (same-org only — cross-org is 404) |
| 404 | `not-found` | Missing **or cross-tenant** (existence never leaked, 03 §4) |
| 409 | `conflict` | Idempotency-key reuse with different body; duplicate slug |
| 422 | `validation` · `column_limit_reached` · `item_limit_reached` · `storage_quota_exceeded` · `subitem_limit_reached` | Semantic failures incl. entitlement limits |
| 429 | `rate-limited` | With `Retry-After` |
| 5xx | `internal` | Includes `request_id` for support |

---

*Next: Stage 3 (per project plan). Any endpoint added later must follow §1 conventions and appear in the OpenAPI spec generated from code.*
