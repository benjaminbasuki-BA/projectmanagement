import { eq } from "drizzle-orm";
import { itemSubscribers } from "../db/schema/index.js";
import type { AppDb } from "../db/types.js";

/**
 * item_subscribers (docs/02 §3.7) drives notification fan-out — who gets
 * told when an item changes. Subscribing is implicit: creating an item,
 * commenting on it, or being assigned to it all count (docs/04 §2.11's
 * event catalog assumes this).
 */
export async function subscribeToItem(
  tx: AppDb,
  params: {
    orgId: string;
    itemId: string;
    userId: string;
    reason: "assignee" | "mentioned" | "creator" | "manual";
  },
): Promise<void> {
  await tx
    .insert(itemSubscribers)
    .values(params)
    .onConflictDoNothing({
      target: [itemSubscribers.itemId, itemSubscribers.userId],
    });
}

export async function getItemSubscribers(
  tx: AppDb,
  itemId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ userId: itemSubscribers.userId })
    .from(itemSubscribers)
    .where(eq(itemSubscribers.itemId, itemId));
  return rows.map((r) => r.userId);
}
