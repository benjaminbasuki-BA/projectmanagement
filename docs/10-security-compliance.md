# 10 — Security & Compliance

| | |
|---|---|
| **Product** | Trellis |
| **Document** | Stage 4 of 4 — Security & Compliance |
| **Status** | Draft v1.0 |
| **Date** | 2026-07-10 |
| **Depends on** | [01](01-vision-and-scope.md) §2.8, [02](02-data-model.md) §1, §8, [03](03-backend-architecture.md) §3–4, §10 |

This document consolidates security material already established in docs 02/03 into one authoritative reference, and designs the pieces that weren't fully specified yet — most notably GDPR-style deletion/export, which prior docs mentioned but didn't fully flow through.

---

## 1. Authentication

| Credential | Mechanics | Notes |
|---|---|---|
| Password | argon2id (m=64 MiB, t=3, p=4); min 10 characters, no composition rules (NIST 800-63B guidance — composition rules push users toward predictable patterns); checked against Pwned Passwords via k-anonymity at signup and change | 03 §3 |
| Session cookie | Opaque 256-bit token, `httpOnly` `Secure` `SameSite=Lax`, 30-day rolling expiry; regenerated on login (prevents session fixation); Postgres is the source of truth, Redis caches | 02 §1.4 |
| Google OAuth | OIDC code flow, links to `users.google_sub` | |
| 2FA (TOTP) | See §2 | |
| Personal access token (PAT) | `trl_pat_…`, SHA-256 stored, scoped `read`/`write`/`admin`, acts as a user within one org | 02 §1.5 |
| Share-link token | Tokenized URL; optional password; comment access requires a 6-digit email code (10-min expiry, 5 attempts, 15-min lockout) | 01 §2.8 |
| SAML / SCIM (Enterprise) | See §3 | |

**Brute-force protection:** 10 attempts / 15-minute sliding window per `(email, IP)`, then exponential lockout with a notification email to the account (03 §3).

**Email verification is not a signup gate** (07 §1 — verifying immediately would add friction to the fastest-value-to-signup path), but it **is** required before a set of higher-trust actions: inviting other members, creating an API token, or connecting a third-party integration. This reconciles the low-friction onboarding flow with the principle that outward-facing or elevated capabilities shouldn't be available from an unverified identity.

## 2. Two-Factor Authentication (2FA)

- TOTP (RFC 6238); secret encrypted with AES-256-GCM via KMS envelope encryption (`users.totp_secret_enc`, 02 §1.2); 10 single-use recovery codes issued at setup, shown once.
- **Enforcement:** opt-in for every account through V1/V2; **org-wide enforced 2FA** becomes available as an Enterprise-phase admin setting (01 §2.8) — an admin can require it for all members, with a grace period (default 7 days) before non-compliant sessions are forced to re-authenticate and set it up.
- **Lost-device recovery:** if a user has exhausted recovery codes and lost their authenticator, only an org admin can initiate a reset — logged as a sensitive `audit_logs` event, requiring the requesting user to reverify via their verified email, with a mandatory 24-hour cool-down before the reset takes effect (gives a legitimate account owner a window to notice and object if the request wasn't theirs).

## 3. SSO / SCIM (Enterprise)

Mediated by WorkOS (03 §2 — chosen specifically to make this a days-not-months lift):

1. An org admin configures an SSO connection in `/org/settings/security` (06 §11), exchanging IdP metadata (SAML 2.0 — Okta, Azure AD, Google Workspace) via WorkOS.
2. Users at the configured domain are redirected to their IdP on login; successful auth **just-in-time provisions** an `org_memberships` row on first login, with a configurable default role.
3. **IdP group → Trellis role mapping** (e.g., an Okta group `Trellis-Admins` maps to the `admin` role) is configurable per connection — SSO authenticates identity, it doesn't replace Trellis's own RBAC (§4).
4. **SCIM** keeps membership in sync with the IdP as source of truth when enabled: near-real-time push where the IdP supports it, with an hourly reconciliation poll as a floor. Deprovisioning in the IdP revokes all active sessions and deactivates the `org_memberships` row within that same window.
5. **Domain capture:** any user signing up with a verified `@acme.com` address automatically joins the org configured for that domain as a member — closes the loophole of someone bypassing SSO by simply signing up directly.

## 4. RBAC — Consolidated Reference

Permissions are the composition of five independent layers (introduced piecemeal in 01 §2.8, 02 §8, 03 §4 — consolidated here as the single reference):

| Layer | Values | Table |
|---|---|---|
| 1. Org role | `admin` · `member` · `viewer` · `guest` | `org_memberships.role` |
| 2. Workspace access | `open` (implicit for all members/viewers) · `closed` (explicit `workspace_members` row) | `workspaces.type` |
| 3. Board access & level | `edit_everything` · `edit_content` · `edit_own` · `view_only` | `board_members.permission_level` |
| 4. Column visibility (Enterprise) | hide specific columns from roles/users | `columns.visibility` |
| 5. Share-link scope | `view` \| `comment`, whitelisted columns only | `share_links` |

**Precedence:** org admin bypasses layers 2–3 (never layer 5 — a share link stays scoped even for content an admin could otherwise see everywhere); the most specific explicit grant wins; a `guest` role **must** have a `board_members` row or they see nothing.

**Worked example — the question actually asked when this model is unclear:** *Can a Guest with `edit_content` on Board X see the "Internal Margin" column if it's hidden from guests?* Resolution walks layer 1 (role = `guest`, passes the "has a board_members row" requirement) → layer 3 (`edit_content` grants read+comment+edit on visible content) → layer 4 (`columns.visibility.hidden_from_roles` includes `guest`) → **the column is stripped from every response before it reaches the client** (03 §4), regardless of the board-level edit permission. Column visibility is a hard filter applied after every other layer resolves, not a competing permission that could be overridden by a higher board-level grant.

**Caching & invalidation:** resolved board-level grants are cached in Redis, stamped with `boards.permission_version` (02 §2.3) — any permission change anywhere in layers 2–4 bumps that version, instantly invalidating stale cached grants (03 §4).

## 5. Encryption

| Layer | Mechanism |
|---|---|
| In transit | TLS 1.2+ everywhere (ALB/CloudFront termination), HSTS; internal service-to-service traffic (RDS, ElastiCache) also runs over TLS within the VPC |
| At rest — database | RDS storage encryption, AES-256, AWS KMS-managed |
| At rest — files | S3 SSE-KMS on every object under `org/{org_id}/*` (02 §5.2) |
| At rest — cache/queues | ElastiCache encryption at rest and in transit |
| Field-level (secrets) | TOTP secrets, OAuth/integration tokens: AES-256-GCM application-level envelope encryption (02 §1.2, §6.5) — a *second* layer beyond volume encryption, so a raw DB snapshot leak still doesn't expose usable secrets |
| Key management | AWS KMS, separate CMKs per purpose (RDS / S3 / application secrets); annual automatic key rotation; IAM-restricted to specific service roles — no human has standing production decryption access; any manual "break-glass" access is itself logged to `audit_logs` |

## 6. Backups & Recovery

Recapping 03 §10 with compliance framing and the retention numbers not previously stated:

| Asset | Mechanism | Target | Retention |
|---|---|---|---|
| PostgreSQL | RDS Multi-AZ, PITR, nightly snapshots, weekly cross-region copy | RPO ≤ 5 min · RTO ≤ 4 h | 35-day PITR window; cross-region weekly snapshots retained 90 days |
| S3 files | Versioning, cross-region replication (from V1) | RPO ~15 min | 30-day noncurrent-version retention |
| Redis | Rebuildable (sessions fall back to Postgres, quota counters reconcile nightly) | RTO minutes | N/A — ephemeral by design |
| Meilisearch | Full reindex from Postgres + daily snapshot | RTO < 1 h | 7-day snapshot rotation |

- Backups inherit the same encryption as their source data (§5); backup access is governed by a **separate IAM role** from the one used for day-to-day production database access, so a compromised app-tier credential doesn't automatically grant backup access.
- **Quarterly restore drills**, running from the moment PITR goes live in Sprint 2 (08 §7) — staging is restored from a real production snapshot, timed, and documented. This is both an operational safety net and standing SOC 2 evidence (§10).

## 7. Audit Logs

Recapping 02 §8 / 03 §8 with the security framing:

- **24-event catalog** (01 §2.8) covering auth, membership, board/share-link lifecycle, exports, and API/webhook token management — written **from day one**, even though the *viewing* UI is Enterprise-gated (02 §8 — audit-log data collection is cheap; retrofitting historical coverage later is not).
- **Append-only:** the application's database role has `INSERT`-only grants on `audit_logs` — no `UPDATE`/`DELETE` path exists in the application at all.
- **Tamper-evidence:** a nightly job computes a SHA-256 hash of each UTC day's `audit_logs` rows, chained to the previous day's hash, stored in a separate `audit_log_checksums` table. Undetected tampering with historical rows would break the chain at the tampered day, an inexpensive and standard control for this class of compliance evidence.
- **Retention:** 2 years, monthly partitions (drop-based expiry, no per-row deletes). Viewing access is restricted to org admins on the Enterprise-gated UI (`GET /org/audit-logs`, 04 §2.2), with SIEM streaming available via the same cursor-paged endpoint.

## 8. GDPR — Deletion & Export

This is the part not fully specified in prior docs — designed here in full.

### 8.1 Right to access / portability (export)

- **Org-level export** (available from MVP, 01 §2.8): `/org/settings` → *Export all organization data* → a background job (the `export-import` queue, 03 §6) assembles a complete archive — every board as CSV, a manifest describing the column schema, all files (originals, from S3), all comments, activity history, and the member list — delivered as a downloadable zip via a signed URL (reusing the file-serving infrastructure, 03 §7). The request itself is logged (`export.requested`, already in the 24-event catalog, 02 §8).
- **Individual data-subject export** (new endpoint, `GET /users/me/export`): produces a personal-data package scoped to one user — profile, org memberships, items they created or are assigned to (metadata only; not full context of boards they don't otherwise have access to), comments they authored, files they uploaded, notification history. Same background-job mechanism as org export. **Target turnaround: under 24 hours** — deliberately faster than GDPR's 30-day allowance, since automating this from day one costs little and a fast SLA is a better trust signal than the legal minimum.

### 8.2 Right to erasure (deletion)

- **Account deletion** (`/settings/security` → *Delete my account*): a confirmation modal explains the consequence up front — items and comments the user created are **not** deleted (that would corrupt other people's boards and work product), they're reassigned to a tombstoned placeholder. Soft-deleted for 30 days (recoverable, matching the existing pattern, 02 §0), then a purge job scrubs PII (`email`, `name`, `avatar_file_id`, `google_sub`, all sessions/tokens) while preserving referential integrity: `created_by` continues to point at the now-anonymized user row, rendered in the UI as *"Deleted user."* This "anonymize, don't cascade" pattern is standard for collaborative-content products and is stated here explicitly so engineering doesn't default to a cascading delete that would silently corrupt other users' history.
- **Organization deletion** (admin-initiated, requires typing the org name to confirm — the standard destructive-action confirmation pattern): 30-day soft delete, then a hard purge of every org-scoped table and all S3 objects under `org/{org_id}/*`. **Exception:** the org's `audit_logs` rows are retained for the full 2-year retention period even after the org itself is gone — the fact that an organization existed and was deleted, and by whom, is itself a record with legitimate legal/dispute value, so it is explicitly excluded from the purge.
- **Single-record erasure** (e.g., a client exercising GDPR rights over one comment they posted via a share link): the existing soft-delete + 30-day purge (02 §0) applies, plus an expedited path — `DELETE ?reason=gdpr_request` skips the 30-day window and purges immediately. This is logged as a new audit event, **`data.erasure_requested`**, extending the 24-event catalog from 02 §8 to 25 — noted here explicitly since this document is the one that grows it.

### 8.3 Sub-processors

| Vendor | Purpose | Data touched |
|---|---|---|
| AWS (RDS, S3, ElastiCache, KMS) | Core infrastructure | All application data |
| Postmark | Transactional email | Recipient email, message content |
| WorkOS (Enterprise only) | SSO/SCIM | Work email, IdP group membership |
| Sentry | Error monitoring | PII-scrubbed error context (03 §10) |
| Grafana Cloud | Metrics/logs/traces | Aggregated telemetry, no PII by design |
| LLM provider (via the `ai` module, 03 §2) | AI features (09 §3) — search, summarization, drafting | Only content the user explicitly submits to an AI action: a search query, the thread being summarized, a brief or meeting notes. **Never** share-link or client-portal content, and never used for model training or fine-tuning (09 §2, §4) — this exclusion is enforced in the `ai` module itself, not left to the provider's own policy |

Meilisearch is **self-hosted** (03 §2), not a sub-processor. A signed DPA is available for every processor above; published as part of the org admin's compliance pack (§10).

### 8.4 Data residency

EU customers may select an EU region at signup (Enterprise phase, 01 §2.9) — a full second Terraform-deployed cell (03 §2), with data and backups staying in-region for the account's lifetime.

### 8.5 Consent & cookies

The session cookie is strictly necessary and requires no consent banner under GDPR. Any non-essential tracking added in the future (product analytics beyond Sentry/Grafana's PII-scrubbed telemetry) must be gated behind explicit consent and documented in the privacy policy — flagged here as a product/legal follow-up, not designed further in this document.

## 9. Org-Level Security Settings

The full settings surface, mapped to the phase each becomes available (consolidating 01 §2.8 and 03 into the single settings-page-shaped reference doc 06 §11 builds from):

| Setting | Phase | Notes |
|---|---|---|
| API token scopes & expiry | MVP | §1 |
| 2FA (opt-in, per user) | MVP | §2 |
| Session list / "sign out everywhere" | MVP | 02 §1.4 |
| Data export (org + personal) | MVP / V1 | §8.1 |
| Guest & share-link visibility audit page | V1 | 01 §2.8 |
| 2FA enforcement (org-wide) | Enterprise | §2 |
| SSO / SCIM / domain capture | Enterprise | §3 |
| Column-level permissions | Enterprise | §4 |
| Status-transition restrictions | Enterprise | 01 §2.2 |
| IP allowlist | Enterprise | |
| Session duration policy | Enterprise | |
| Data residency selection | Enterprise | §8.4 |
| Custom retention policy | Enterprise | |
| Audit log viewer + SIEM streaming | Enterprise | §7 |

## 10. Enterprise Compliance Considerations

**SOC 2 Type II readiness checklist** (engaged in the Enterprise phase, 08 §6 — here's what that operationally requires beyond the product features above):

- [ ] Documented access-control policy (who can access production, how access is granted/revoked)
- [ ] Vendor risk assessments for every sub-processor in §8.3
- [ ] Written incident-response plan and runbook (see below)
- [ ] Employee security onboarding/offboarding checklist (device encryption, credential revocation on departure, background checks where applicable)
- [ ] Change-management evidence — already largely satisfied by existing practice (GitHub PR review + Terraform plan review, 03 §2) but formalized into an auditable trail
- [ ] Quarterly restore drills on record (§6)
- [ ] Annual third-party penetration test, scheduled *before* the SOC 2 engagement begins (08 §7)

**GDPR:** the deletion/export flows in §8 satisfy Articles 15 (access), 17 (erasure), and 20 (portability). A signed DPA is available on request from the Enterprise phase onward; an EU representative is appointed if/when EU customer volume warrants it.

**HIPAA:** explicitly **not** claimed as compliant today — stated plainly to avoid any misrepresentation risk. 01 §2.9 lists a HIPAA BAA as "on roadmap" only; reaching that point would require executing BAAs with every sub-processor that could touch PHI, PHI-specific encryption and audit requirements beyond what's specified here, and a dedicated compliance workstream not yet scoped. Any customer request implying HIPAA applicability should be routed to this gap, not answered informally.

**Incident response (outline):** detection via Sentry/Grafana alerting (03 §10) → internal triage and severity classification → for confirmed data breaches, notification to the relevant supervisory authority within 72 hours (GDPR Art. 33) and to affected org admins without undue delay, via the same notification pipeline used for product events (03 §7) plus direct email outside that system in case the incident affects notification delivery itself.

---

*This is the final document in the 4-stage Trellis blueprint (docs 01–10). Together they form a build-ready specification: vision and scope, data model, backend architecture, API design, automation engine, frontend architecture, UX flows, roadmap, differentiation strategy, and security posture.*
