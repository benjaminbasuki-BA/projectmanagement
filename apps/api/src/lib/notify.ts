import { and, eq, inArray } from "drizzle-orm";
import {
  notifications,
  notificationPreferences,
  boardMutes,
  users,
} from "../db/schema/index.js";
import { withTenantContext } from "../db/tenant-db.js";
import type { AppDb } from "../db/types.js";

/** Matches notifications.event_type's CHECK constraint (docs/02 §5.4). */
export type NotificationEventType =
  | "assigned"
  | "mentioned"
  | "reply"
  | "reaction"
  | "status_changed"
  | "due_soon"
  | "item_created";

/**
 * Fans a product event out to `notifications` rows for whoever should see
 * it — never the actor themselves, and never someone who's muted the
 * board (docs/02 §5.5). Called from inside the same transaction as the
 * mutation it's about, same reasoning as recordActivity (lib/activity.ts):
 * a notification that exists without the event it describes (or vice
 * versa) would be a real bug.
 *
 * Returns the subset of recipients whose `email_cadence` is `instant`
 * (the default — docs/02 §5.5), for the caller to actually send mail
 * to *after* the transaction commits (matching the rest of the codebase:
 * auth's password-reset flow sends mail as a separate best-effort step,
 * never inside the write transaction, so a slow mail provider can't hold
 * a lock). `hourly`/`daily` cadences are accepted by the schema but have
 * no digest job to honor them yet — that needs the `worker` process,
 * which doesn't exist in this repo yet.
 */
export async function notifyUsers(
  tx: AppDb,
  params: {
    orgId: string;
    actorId: string;
    recipientUserIds: string[];
    eventType: NotificationEventType;
    itemId?: string;
    boardId?: string;
    commentId?: string;
    payload: Record<string, unknown>;
  },
): Promise<{ notificationId: string; email: string }[]> {
  const candidates = Array.from(new Set(params.recipientUserIds)).filter(
    (id) => id !== params.actorId,
  );
  if (candidates.length === 0) return [];

  let targets = candidates;
  if (params.boardId) {
    const muted = await tx
      .select({ userId: boardMutes.userId })
      .from(boardMutes)
      .where(
        and(
          eq(boardMutes.boardId, params.boardId),
          inArray(boardMutes.userId, candidates),
        ),
      );
    const mutedIds = new Set(muted.map((m) => m.userId));
    targets = candidates.filter((id) => !mutedIds.has(id));
  }
  if (targets.length === 0) return [];

  const inserted = await tx
    .insert(notifications)
    .values(
      targets.map((userId) => ({
        orgId: params.orgId,
        userId,
        eventType: params.eventType,
        actorId: params.actorId,
        itemId: params.itemId ?? null,
        boardId: params.boardId ?? null,
        commentId: params.commentId ?? null,
        payload: params.payload,
      })),
    )
    .returning({ id: notifications.id, userId: notifications.userId });

  const [prefRows, userRows] = await Promise.all([
    tx
      .select({
        userId: notificationPreferences.userId,
        emailCadence: notificationPreferences.emailCadence,
      })
      .from(notificationPreferences)
      .where(inArray(notificationPreferences.userId, targets)),
    tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, targets)),
  ]);
  const cadenceByUser = new Map(
    prefRows.map((r) => [r.userId, r.emailCadence]),
  );
  const emailByUser = new Map(userRows.map((r) => [r.id, r.email]));

  // No notification_preferences row = the schema default, "instant".
  return inserted
    .filter((row) => (cadenceByUser.get(row.userId) ?? "instant") === "instant")
    .map((row) => ({
      notificationId: row.id,
      email: emailByUser.get(row.userId)!,
    }));
}

/**
 * Marks a batch of notifications as emailed, after a successful send.
 * Runs in its own tenant-scoped transaction — by the time a caller knows
 * whether the send succeeded, the transaction that inserted these rows
 * has already committed, and RLS (FORCE ROW LEVEL SECURITY) means a
 * write with no `app.org_id` set just silently affects zero rows rather
 * than erroring, so this can't reuse the original `tx`.
 */
export async function markEmailed(
  db: AppDb,
  orgId: string,
  notificationIds: string[],
) {
  if (notificationIds.length === 0) return;
  await withTenantContext(db, orgId, (tx) =>
    tx
      .update(notifications)
      .set({ emailedAt: new Date() })
      .where(inArray(notifications.id, notificationIds)),
  );
}
