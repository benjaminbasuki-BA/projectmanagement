# 05 — Automation Engine

| | |
|---|---|
| **Product** | Trellis |
| **Document** | Stage 3 of 4 — Automation Engine |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-10 |
| **Depends on** | [01](01-vision-and-scope.md) §2.9 (pillar 3, transparency), [02](02-data-model.md) §6, [03](03-backend-architecture.md) §6 |

> **Note on limits:** the original brief for this stage asks for "limits by pricing plan." Per the free-for-now decision (01 §2.9), Trellis has no pricing plans yet — so limits below are the single fair-use quota that applies to every account, exactly as introduced in doc 01/02. §6 documents this and where plan-based limits would slot in later without a rewrite.

---

## 1. The Recipe Model

Every automation is one row in `automations` (02 §6.1): **When {trigger} → If {conditions} → Then {actions}.** The three parts are independent jsonb blocks with a `type` discriminator, which is *why* new trigger/action types never require a schema migration (§7.7).

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   TRIGGER    │ ──► │   CONDITIONS      │ ──► │   ACTIONS    │
│  (exactly 1) │     │ (0–3, AND, V1)     │     │ (1 in V1,    │
│              │     │ (AND/OR groups V2) │     │  ≤5 in V2)   │
└─────────────┘     └──────────────────┘     └─────────────┘
```

**Human-readable rendering:** the builder (doc 06 §10) always shows a live sentence built from the same three blocks — *"When **Status** changes to **Client review**, notify **Board owner**."* — so what's stored is exactly what a non-technical user reads. There is no hidden logic a recipe can contain that isn't visible in that sentence.

### 1.1 Trigger catalog

| `type` | Config fields | Detection mode | Phase | Example |
|---|---|---|---|---|
| `status_changed` | `column_id`, `to_label_id`, `from_label_id?` | event | MVP-adjacent / V1 | Status → *Client review* |
| `column_value_changed` | `column_id`, `to?` (omit = any change) | event | V1 | *Priority* dropdown changes to anything |
| `item_created` | `group_id?` | event | V1 | New item lands in *Triage* |
| `item_moved_to_group` | `to_group_id`, `from_group_id?` | event | V1 | Item dragged into *Design* |
| `person_assigned` | `column_id`, `user_id?` (omit = anyone) | event | V1 | *Owner* column gets a person |
| `date_arrives` | `column_id`, `offset_days` (−30…0), `at` (`"HH:MM"` workspace tz) | scheduled scan | V1 | 1 day before *Due date* |
| `form_submitted` | `view_id` | event | V1 | *Creative Request* form submitted |
| `cron` | `every` (`day·week·month·quarter`), `weekday?`, `monthday?`, `at` | scheduled tick | V1 | Every Monday 09:00 |
| `item_connected` | `column_id` (a `connect_boards` column) | event | V2 | Item linked to another board's item |
| `integration_event` | `provider`, `event_type`, `filter?` | event (inbound webhook) | V2 | GitHub PR merged |

### 1.2 Condition catalog

Up to 3 per recipe in V1 (all ANDed); nested AND/OR groups arrive in V2 alongside the same expansion in saved-view filters (01 §2.3). Comparator vocabulary is **identical** to view filters (02 §4.1) — one mental model for "narrow this" everywhere in the product:

| Column type | Comparators |
|---|---|
| `status` / `dropdown` | `is_any_of` · `is_none_of` |
| `text` / `long_text` | `contains` · `is` · `is_empty` |
| `number` / `rating` | `eq` · `neq` · `gt` · `lt` · `between` |
| `date` / `timeline` | `is` · `before` · `after` · `last_n_days` · `next_n_days` · `overdue` |
| `person` | `is_any_of` · `is_me` · `is_empty` |
| any | `is_empty` · `is_not_empty` |

### 1.3 Action catalog

| `type` | Config fields | Phase | Example |
|---|---|---|---|
| `change_status` | `column_id`, `to_label_id` | V1 | Set *Status* → *Approved* |
| `set_column_value` | `column_id`, `value` (any canonical shape, 02 Appx A) | V1 | Set *Priority* → *High* |
| `move_to_group` | `group_id` | V1 | Move to *Delivered* |
| `move_to_board` | `board_id`, `group_id`, `column_mapping?` | V2 | Move to another board (cross-board) |
| `assign_person` | `column_id`, `user_id` \| `"creator"` \| `"board_owner"` | V1 | Assign *Owner* → triggering item's creator |
| `set_date` | `column_id`, `offset_days` (relative to trigger time or another date column) | V1 | *Due date* = today + 5 |
| `create_item` | `board_id?` (default: same board), `group_id`, `name_template`, `column_values?` | V1 (same-board) / V2 (cross-board) | Create "Weekly status report" |
| `create_subitem` | `name_template`, `column_values?` | V1 | Create "Send offer letter" subitem |
| `notify` | `target` (`"creator"`\|`"board_owner"`\|`"assignee"`\|`user_id`\|`team_id`), `message_template` | V1 | Notify board owner |
| `post_update` | `message_template` | V1 | Post a system comment on the item |
| `send_slack_message` | `connection_id`, `channel`, `message_template` | V1 | Post to `#acme-client-updates` |
| `send_email` | `to_template`, `subject_template`, `body_template` | V1 | Email a stakeholder |
| `create_calendar_event` | `connection_id`, `date_column_id`, `title_template` | V2 | Google Calendar event |
| `call_webhook` | `webhook_id` | V2 | Fire a custom webhook as a recipe action |

`{item.name}`, `{item.display_id}`, `{item.due_date}`, `{actor.name}`, `{column.<id>}` are the supported template tokens in any `*_template` field, resolved against the trigger item's snapshot (§7.3).

---

## 2. Status-Change Automations

The most common category — a status label change is the highest-signal event in a board's lifecycle.

| # | Board | When | If | Then |
|---|---|---|---|---|
| 1 | Acme — Website Redesign | Status → **Approved** | — | Move to group *Delivered*; notify Priya "Deliverable approved: {item.name}" |
| 2 | Acme — Website Redesign | Status → **On hold** | — | Post update "⏸ Paused — waiting on client"; notify Owner |
| 3 | Bug/Issue Tracker | Status → **Fixed** | — | Notify team *QA*; set *Verified* checkbox to unchecked |
| 4 | Recruiting Pipeline | Status → **Offer** | — | Create subitem "Prepare offer letter" assigned to *HR Lead* |
| 5 | Studio Requests | Status → **Done** | Requester email is not empty | Notify requester via their subscribed thread |

## 3. Date-Based Automations

Detected by the `date-trigger-scanner` cron (§7.1) rather than by an event — the item didn't change, time did.

| # | Board | When | If | Then |
|---|---|---|---|---|
| 6 | Acme — Website Redesign | 1 day before *Due date*, 09:00 | Status is none of [Approved, Delivered] | Notify Owner "Due tomorrow: {item.name}" |
| 7 | Studio Requests | *Due date* is overdue, checked daily 08:00 | Status ≠ Done | Change Status → *Escalated*; notify Ops Lead |
| 8 | Content Calendar | *Publish date* arrives, 08:00 | — | Send Slack message to `#content-live` |
| 9 | Recruiting Pipeline | 3 days before *Offer expires* | Status = Offer | Notify Recruiter |
| 10 | Acme — Website Redesign | Item created | — | Set *Due date* = created date + 5 business days |

## 4. Assignment Automations

| # | Board | When | If | Then |
|---|---|---|---|---|
| 11 | Studio Requests | *Owner* column assigned | — | Notify assignee "You've been assigned {item.name}" |
| 12 | Acme — Website Redesign | *Owner* changes | Status = Client review | Reset Status → *In progress* (re-review needed) |
| 13 | Bug/Issue Tracker | *Priority* = Critical | *Owner* is empty | Assign *Owner* → Eng Lead; notify them |
| 14 | Content Calendar | Item moved into group *Design* | — | Assign *Owner* → Default Designer |
| 15 | Recruiting Pipeline | *Owner* assigned | — | Add assignee as item subscriber; Slack DM |

## 5. Notification Automations

Actions that inform without changing state — the quiet workhorses that replace status-call overhead (01 §1.2 use case 1).

| # | Board | When | If | Then |
|---|---|---|---|---|
| 16 | Studio Requests | Item created (via form) | — | Notify Ops Lead; post to `#requests` |
| 17 | Content Calendar | Status → **Internal review** | — | Notify Content Lead |
| 18 | Bug/Issue Tracker | *Priority* changes to Critical | — | Notify `#incidents` Slack; email eng-lead@northpeak.agency |
| 19 | Acme — Website Redesign | Client comments via share link | — | Notify item Owner and Priya |
| 20 | Agency Retainer Tracker | `cron`: every Friday 17:00 | ≥1 item Status = On hold | Notify Priya with the on-hold item list |

## 6. Recurring & Scheduled Automations

**Distinct from recurring *items*** (02 §3.6, the "repeat this item" clone-on-schedule feature). These are `cron`-type automation **triggers** — they don't require an existing item, they fire on the clock and typically create one.

| # | Board | Schedule | Then |
|---|---|---|---|
| 21 | Agency Retainer Tracker | Every Monday, 09:00 | Create item "Weekly client status report" in group *This Week* |
| 22 | Studio Requests | 1st of every month, 09:00 | Create item "Monthly retainer usage report" |
| 23 | Content Calendar | Every Friday, 16:00 | Create item "Next week's content review" in group *Planning* |
| 24 | Acme — Website Redesign | Every day, 08:00 | Scan items On hold > 5 days; notify Priya as one digest |
| 25 | Studio Ops | 1st day of every quarter | Create item "Quarterly client satisfaction survey" |

## 7. Cross-Board Automations (V2)

Requires a `connect_boards` column (01 §2.2, V2) linking the two items, or an explicit `board_id` on the `create_item`/`move_to_board` action. This is the mechanism that ties the client-intake wedge to delivery boards without merging them into one giant board.

| # | From board | When | If | Then (on the other board) |
|---|---|---|---|---|
| 26 | Studio Requests | Status → **Approved** | Client = "Acme" | Create linked item on *Acme — Website Redesign*, group *Backlog* |
| 27 | Bug/Issue Tracker | Linked item's Status → **Fixed** | — | Set the connected deliverable's Status → *In progress* |
| 28 | Recruiting Pipeline | Status → **Hired** | — | Create item on *Studio Ops Onboarding* board |
| 29 | Agency Retainer Tracker (portfolio) | `cron`: daily 07:00 scan | > 20% of a linked board's items are On hold | Notify the Account Manager for that client |
| 30 | Content Calendar | Status → **Scheduled** | Item is linked to a client deliverable | Mirror Status → *Client review* on the linked item |

## 8. Integration-Based Automations

Slack/email actions (`send_slack_message`, `send_email`) are V1; integration-originated **triggers** (GitHub, Calendar) land with those integrations in V2 (01 §2.9 integrations table). §11 explains how new provider triggers plug in without touching the schema.

| # | Board | When | Then | Phase |
|---|---|---|---|---|
| 31 | Acme — Website Redesign | Status → **Client review** | Post Slack message to `#acme-client-updates` | V1 |
| 32 | Studio Requests | Form submitted | Slack DM to Ops Lead | V1 |
| 33 | Bug/Issue Tracker | GitHub PR merged, referencing this item (`integration_event`) | Set Status → *Fixed* | V2 |
| 34 | Content Calendar | Status → **Scheduled** | Create a Google Calendar event from *Publish date* | V2 |
| 35 | Acme — Website Redesign | *Files* column updated | Copy the new file to the connected Google Drive folder | V2 |

*(35 recipes total, ≥ 5 per requested category.)*

---

## 9. Automation Limits (fair-use, not pricing-tiered)

Consistent with 01 §2.9 and 02 §9: no plan differentiates these numbers today. Every organization shares one set of caps, enforced by the `entitlements` module (`entitlements.check(org_id, 'automation_runs')`), visible as a usage meter in `/org/settings/usage` (04 §2.2 `GET /org/usage`).

| Limit | Value | Enforcement point |
|---|---|---|
| Automation runs | 25,000 / org / month | `INCR org:{id}:runs:{yyyymm}` in Redis before execution (03 §6 step 2) |
| Recipes per board | 100 | checked on `POST /boards/{id}/automations` |
| Conditions per recipe | 3 (V1) | request-schema validated |
| Actions per recipe | 1 (V1) → 5 (V2) | request-schema validated |
| Chain depth (loop guard) | 3 (§10) | runtime, not user-configurable |
| Dry-run lookback window | 7 days | fixed |

**When the quota is hit:** the triggering run is logged with `status = quota_exceeded` (not silently dropped), the *recipe* is set `enabled = false` with `disabled_reason = 'quota_exceeded'`, and the board owner is notified with a one-click re-enable (available immediately next month, or on manual quota raise via support). This graceful-degradation behavior — nothing is ever deleted, everything is logged — is pillar 3 from 01 §1.1 applied to the failure path, not just the happy path.

**Future monetization hook (documented, not built):** if plans are introduced later (01 §2.9), `automation_runs` and `recipes per board` are the two numbers most likely to become plan-differentiated. Because every check already routes through `entitlements`, that's a config change, not an engineering project.

---

## 10. Technical Deep Dive

### 10.1 How triggers are detected

Two detection modes, matched to the trigger's nature:

**Event-driven** (`status_changed`, `column_value_changed`, `item_created`, `item_moved_to_group`, `person_assigned`, `form_submitted`, `item_connected`, `integration_event`): the mutating transaction writes a row to `outbox` (02 §6.3) *in the same transaction* as the domain change. An outbox relay process publishes each row to the Redis Stream `events:{org_id}` within milliseconds. There is no polling for these — the event exists the instant the row commits.

**Time-driven** (`date_arrives`, `cron`): nothing "happens" to an item, so nothing is in the outbox. Two scheduled jobs generate synthetic events:
- `date-trigger-scanner` (BullMQ cron, every 15 min): `SELECT item_id, board_id, date_value FROM column_values WHERE date_value BETWEEN now() AND now() + interval '30 days' AND …` using the `ix_cv_org_date` index (02 §3.3), cross-referenced against each board's `date_arrives` recipes to find matches where `date_value - offset_days` falls in the just-elapsed 15-minute window.
- `automation-cron-ticker` (every 1 min): loads all `cron`-type recipes, evaluates each against `now()` in the *board's workspace timezone* using a cron-expression evaluator, and fires a synthetic `{"type":"cron_fired","automation_id":…}` event for any recipe whose scheduled instant just passed. A 1-minute tick keeps `at: "09:00"` accurate without per-recipe scheduling infrastructure.

Both scanners publish synthetic events into the *same* `events:{org_id}` stream — from the matcher's point of view (§10.2) there is no difference between "the user changed a status" and "the clock struck 9am."

### 10.2 How conditions are evaluated

The `automation-exec` BullMQ consumer, on picking up a matched-trigger job, evaluates each condition against the **event's snapshot** — not a fresh database read. The mutating transaction includes the item's current column values in the outbox payload precisely so the matcher never races a fast follow-up edit. Each condition's `cmp` runs against the extracted `text_value`/`number_value`/`date_value` (02 §3.3) or the raw `value` for set-membership comparators. V1 conditions are ANDed with short-circuit evaluation (first `false` skips remaining checks — cheap and sufficient at ≤ 3 conditions). The per-condition pass/fail is recorded, not just the final boolean, so a failed match is explainable in the run log (§10.7), not silent.

### 10.3 How actions are executed

Actions execute **sequentially**, never in parallel — action 2 may depend on action 1's effect (e.g., `move_to_group` then `notify` referencing the new group). Each `action.type` maps to a registered handler: `actionHandlers[type](ctx, config)`, where `ctx = {org_id, board_id, trigger_item, run_id, chain_depth, automation_id}`.

Critically, **handlers call the exact same domain-service functions the REST API calls** (`items.setColumnValue()`, `items.move()`, `notifications.send()`, …) — an automation changing a status is, to the rest of the system, indistinguishable from a user doing it via `PATCH /items/{id}/column-values`, except `activity_events.actor_id` is null and `automation_id` is set (02 §5.3). This means automations automatically inherit every business rule (column type validation, entitlement checks, the outbox write that re-triggers real-time and downstream automations) with zero duplicated logic — the automation engine has no "shadow" write path.

### 10.4 How jobs are queued

The outbox relay doesn't decide which recipes match — it just publishes raw events. The `automation-exec` consumer (03 §6, concurrency 20/worker) is the one that:
1. Loads the board's enabled recipes from Redis (`automations:{board_id}:{version}`, populated from Postgres on cache miss, invalidated by the same `boards.permission_version`-style version bump pattern used for authz — here `automations.version` bumps on any recipe edit).
2. Filters to recipes whose `trigger.type` and config match the incoming event.
3. For **each match** (one event can match several recipes), enqueues one BullMQ job onto `automation-exec` with `jobId = "${automation_id}:${outbox_event_id}"`. Reusing the outbox event id in the job id makes re-publishing (e.g., relay restart) a safe no-op — BullMQ dedupes by job id.
4. The job itself, when processed, runs §10.2 → §10.3 and writes one `automation_runs` row (02 §6.2).

### 10.5 How infinite loops are prevented

Every `automations.actions` handler that mutates data emits its own outbox event, which can legitimately match *another* recipe — chaining is a feature (recipe A moves an item, recipe B notifies on that move). Left unchecked this can cycle. The guard:

- Every job carries `chain_depth`, starting at 0 for a user- or clock-originated event.
- When an action's mutation produces a new outbox event, that event is tagged with `chain_depth = parent.chain_depth + 1`.
- The matcher refuses to enqueue a job with `chain_depth > 3`. That run is written with `status = 'loop_stopped'`, and **both** the originating and the currently-matched recipe are flagged in the UI (a "may be looping" badge on the Automations list, doc 06 §10) so the fix is discoverable, not just silently absorbed.
- Depth 3 is a fixed constant, not user-configurable (01 §2.9's automation section notes this as intentional — configurable loop limits are themselves a footgun).
- Direct self-triggering (recipe's own action re-satisfies its own trigger) is caught by the same mechanism on its second hop — no special-cased detection needed.

### 10.6 How failed runs are handled and retried

A run fails when an action handler throws: validation error (rare — actions are built from the same schemas as the API), permission error (e.g., the assignee target was removed from the board between trigger and execution), or a downstream provider error (Slack 429, expired OAuth token).

- The BullMQ job retries with **exponential backoff: 10 s → 1 m → 5 m**, 3 attempts total (03 §6), after which the run is marked `status = 'failed'` and the board owner receives an `automation_failed` notification (01 §2.6 catalog) with a deep link to the run.
- **Retries are checkpointed, not restarted from scratch.** `actions_log` (02 §6.2) records each completed action's outcome as it happens; on retry, the executor re-reads `actions_log` for this `run_id` and skips actions already marked `ok: true` — so a 3-action recipe that failed on action 3 doesn't re-send the Slack message from action 1 a second time. Idempotency keys on `notify`/`send_email`/`send_slack_message` (keyed by `run_id:action_index`) provide a second layer of protection against provider-side duplicate delivery.
- **Repeated-failure circuit breaker:** if a single recipe accumulates 20 consecutive failed runs (independent of the quota mechanism), it is auto-disabled with `disabled_reason = 'repeated_failures'` and the owner notified — mirroring the webhook auto-disable pattern at a lower threshold, since a broken automation silently re-failing 25,000 times/month is a worse outcome than pausing it.
- Errors are structured (`02 §6.2 error jsonb`: `{code, message, provider_response?}`) so the run detail view (§10.7) can show *"Slack API error 429: rate limited"* rather than a generic failure.

### 10.7 How logs are shown to users

Every attempt — success, failure, skip, or loop-stop — writes to `automation_runs`. Two surfaces read it (full UI spec in doc 06 §10):

1. **Per-board Automation Activity tab** (`GET /boards/{id}/automation-runs?status=failed`, 04 §2.9): a chronological list across all of a board's recipes — "Run #4,812 — 'When Status → Stuck, notify board owner' — succeeded, 09:14, triggered by TRL-1042."
2. **Per-recipe run history** (`GET /automations/{id}/runs`): scoped to one recipe, with a run-detail drawer showing the full `trigger_snapshot`, each condition's pass/fail, the `actions_log` timeline with per-action latency, and the structured error if failed.

The **monthly quota meter** and **dry-run preview** (`POST /automations/{id}/dry-run`, 04 §3.8) live in the same builder surface so a user evaluates a recipe's real-world firing frequency *before* enabling it — this is the concrete mechanism behind pillar 3's "automations you can trust" claim (01 §1.1).

### 10.8 How future integration triggers are supported

The `integration_event` trigger type (§1.1) exists in the schema today specifically so V2 integrations (GitHub, Teams, HubSpot — 01 §2.9) require **no automations schema migration** when they land:

1. A new `IntegrationProvider` module (03 §9) implements an inbound handler at `POST /v1/integrations/{provider}/inbound`, verifying the provider's signature scheme.
2. The handler normalizes the provider's payload into a canonical envelope: `{type: "integration_event", provider: "github", event_type: "pr_merged", external_ref: "…", org_id, board_id?, item_id?}`. Resolving `item_id` uses the provider's own link column (e.g., a `link`-type column holding a GitHub PR URL) or an explicit `connect` step done once when the integration is set up.
3. That envelope is written to the **same `outbox` table** as first-party mutations — an integration event is not a special code path from `automation-exec`'s point of view.
4. The matcher (§10.4 step 2) gains one new `case 'integration_event'` in its trigger-type switch, matching on `provider` + `event_type` + an optional payload `filter` (e.g., `{"repo": "northpeak/acme-site"}`).
5. Because `trigger` is jsonb with a `type` discriminator (02 §6.1), the `automations` table itself never changes shape — only the provider module and one matcher case are new code, shippable behind a per-provider feature flag.

This is the same reason `column_values` (02 §3.3) and `widgets.config` (02 §7.2) are jsonb: **the parts of the schema that need to grow with the product are the parts designed as open-ended documents**, while the parts that need strong guarantees (tenancy, foreign keys, uniqueness) stay relational.

---

*Next: [06-frontend-architecture.md](06-frontend-architecture.md) — the automation builder UI that sits on top of this engine.*
