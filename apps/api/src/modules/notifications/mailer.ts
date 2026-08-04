import type { Mail } from "../../lib/mailer.js";
import type { NotificationEventType } from "../../lib/notify.js";

/**
 * One line per event type (docs/02 §5.4's catalog) — payload is the
 * denormalized `{item_name, board_name, preview}` shape the doc
 * specifies, built by the caller at write time so this never needs to
 * re-fetch anything.
 */
const SUBJECTS: Record<NotificationEventType, (actor: string) => string> = {
  assigned: (actor) => `${actor} assigned you an item`,
  mentioned: (actor) => `${actor} mentioned you`,
  reply: (actor) => `${actor} replied on a thread you're in`,
  reaction: (actor) => `${actor} reacted to your update`,
  status_changed: (actor) => `${actor} changed an item's status`,
  due_soon: () => `An item is due soon`,
  item_created: (actor) => `${actor} created a new item`,
};

export function notificationMail(
  to: string,
  input: {
    eventType: NotificationEventType;
    actorName: string;
    itemName?: string;
    boardName?: string;
    preview?: string;
  },
): Mail {
  const subject = SUBJECTS[input.eventType](input.actorName);
  const lines = [subject + "."];
  if (input.itemName) lines.push(`Item: ${input.itemName}`);
  if (input.boardName) lines.push(`Board: ${input.boardName}`);
  if (input.preview) lines.push("", `"${input.preview}"`);
  lines.push("", "Open Trellis to see the full thread.");
  return { to, subject, text: lines.join("\n") };
}
