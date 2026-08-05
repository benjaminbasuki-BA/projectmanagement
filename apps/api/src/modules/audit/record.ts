import { auditLogs } from "../../db/schema/index.js";
import type { AppDb } from "../../db/types.js";

/**
 * Appends one row to `audit_logs` (docs/02-data-model.md §8). Written
 * from MVP even though its viewing UI is Enterprise-only (CLAUDE.md,
 * "Constraint" section) — every admin action that lands in this pass
 * (invite, role change, deactivate, org rename, workspace rename, data
 * export) calls this.
 *
 * `org_id` is `NOT NULL` on the table, which is a real fit for
 * org-scoped admin actions but not for the catalog's pre-org-context
 * events (`user.login_failed` has no session yet; `user.login` /
 * `user.logout` only have one *if* the session already has an active
 * org). Callers of this module skip the call entirely rather than
 * force an org id that doesn't mean anything yet — see auth/routes.ts.
 *
 * Callers pass the transaction they're already inside, same discipline
 * as `recordActivity` (lib/activity.ts) — the audit row should never
 * exist without the action it describes actually having committed.
 */
export async function recordAuditEvent(
  tx: AppDb,
  event: {
    orgId: string;
    actorId: string | null;
    actorIp?: string;
    event: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditLogs).values({
    orgId: event.orgId,
    actorId: event.actorId,
    actorIp: event.actorIp,
    event: event.event,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata ?? {},
  });
}
