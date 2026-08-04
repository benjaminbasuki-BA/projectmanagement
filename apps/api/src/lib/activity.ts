import { eq, sql } from "drizzle-orm";
import { boards, activityEvents } from "../db/schema/index.js";
import type { AppDb } from "../db/types.js";

/**
 * Appends one row to `activity_events` (docs/02-data-model.md §5.3), the
 * item/board history feed behind an item's Activity tab and
 * `GET /boards/{id}/activity`. `board_seq` is `boards.event_seq` bumped
 * atomically in the same transaction as the write it's recording — same
 * pattern as items' `display_seq` (see items.routes.ts) — so a real-time
 * client can resync from a cursor without gaps or duplicates (03 §5).
 *
 * Callers pass the transaction they're already inside; this never opens
 * its own, so recording the event is atomic with the mutation it
 * describes (a comment that "posted" but has no activity row, or vice
 * versa, would be a real bug — see docs/02 §5.3 event_type catalog for
 * the string these payloads assume).
 */
export async function recordActivity(
  tx: AppDb,
  event: {
    orgId: string;
    boardId: string;
    itemId?: string;
    actorId: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const [{ eventSeq }] = await tx
    .update(boards)
    .set({ eventSeq: sql`${boards.eventSeq} + 1` })
    .where(eq(boards.id, event.boardId))
    .returning({ eventSeq: boards.eventSeq });

  await tx.insert(activityEvents).values({
    orgId: event.orgId,
    boardId: event.boardId,
    itemId: event.itemId ?? null,
    actorId: event.actorId,
    eventType: event.eventType,
    payload: event.payload ?? {},
    boardSeq: eventSeq,
  });
}
