import type { ActivityEvent, Column } from "../../lib/api-client";
import { useItemActivity } from "../../lib/queries";

function labelText(column: Column | undefined, labelId: unknown): string {
  if (!column || typeof labelId !== "string") return String(labelId ?? "—");
  return column.settings.labels?.find((l) => l.id === labelId)?.text ?? labelId;
}

function optionText(column: Column | undefined, value: unknown): string {
  if (!column || !Array.isArray(value)) return "—";
  const options = column.settings.options ?? [];
  return (
    value
      .map((id) => options.find((o) => o.id === id)?.text ?? id)
      .join(", ") || "(none)"
  );
}

/** Renders a column_value.changed event's `{from,to}` payload as text. */
function describeValue(column: Column | undefined, value: unknown): string {
  if (value === null || value === undefined) return "empty";
  const v = value as Record<string, unknown>;
  switch (column?.type) {
    case "status":
      return labelText(column, v.label_id);
    case "dropdown":
      return optionText(column, v.option_ids);
    case "checkbox":
      return v.checked ? "checked" : "unchecked";
    case "person":
      return Array.isArray(v.user_ids)
        ? `${v.user_ids.length} ${v.user_ids.length === 1 ? "person" : "people"}`
        : "empty";
    case "date":
      return typeof v.date === "string" ? v.date : "empty";
    case "number":
      return typeof v.number === "number" ? String(v.number) : "empty";
    default:
      return typeof v.text === "string" ? v.text : "empty";
  }
}

function describeEvent(event: ActivityEvent, columns: Column[]): string {
  const who = event.actorName ?? "Someone";
  const payload = event.payload;

  switch (event.eventType) {
    case "item.created":
      return `${who} created this item`;
    case "item.renamed":
      return `${who} renamed this item to "${String(payload.to ?? "")}"`;
    case "item.moved":
      return `${who} moved this item`;
    case "item.archived":
      return `${who} archived this item`;
    case "item.deleted":
      return `${who} deleted this item`;
    case "comment.posted":
      return `${who} posted an update`;
    case "column_value.changed": {
      const column = columns.find((c) => c.id === payload.columnId);
      const label = column?.title ?? "a column";
      return `${who} set ${label} to ${describeValue(column, payload.to)} (was ${describeValue(column, payload.from)})`;
    }
    default:
      return `${who} — ${event.eventType}`;
  }
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityTab({
  itemId,
  columns,
}: {
  itemId: string;
  columns: Column[];
}) {
  const { data, isPending } = useItemActivity(itemId);

  if (isPending) {
    return <p className="py-4 text-sm text-neutral-400">Loading activity…</p>;
  }

  const events = data?.events ?? [];
  if (events.length === 0) {
    return <p className="py-4 text-sm text-neutral-400">No activity yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-3 py-4">
      {events.map((event) => (
        <li key={event.id} className="flex items-start justify-between gap-3">
          <span className="text-sm text-neutral-600">
            {describeEvent(event, columns)}
          </span>
          <span className="shrink-0 text-[11px] whitespace-nowrap text-neutral-400">
            {formatWhen(event.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
