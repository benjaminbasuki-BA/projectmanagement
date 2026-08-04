import {
  AlignLeft,
  Calendar,
  CircleChevronDown,
  Hash,
  SquareCheck,
  Tag,
  Type,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  Avatar,
  Badge,
  DropdownMenuItem,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  StatusFill,
  statusFillRatio,
} from "@trellis/ui";
import type { Column, ColumnValue } from "../../lib/api-client";

/** Type metadata for the 8 MVP column types (docs/01 §2.2). */
export const COLUMN_TYPE_META: Record<
  string,
  { label: string; Icon: LucideIcon }
> = {
  status: { label: "Status", Icon: Tag },
  text: { label: "Text", Icon: Type },
  long_text: { label: "Long text", Icon: AlignLeft },
  number: { label: "Number", Icon: Hash },
  person: { label: "Person", Icon: User },
  date: { label: "Date", Icon: Calendar },
  dropdown: { label: "Dropdown", Icon: CircleChevronDown },
  checkbox: { label: "Checkbox", Icon: SquareCheck },
};

/** Column-type picker rows — used by every "+ Add column" menu. */
export function ColumnTypeMenuItems({
  onPick,
}: {
  onPick: (type: string) => void;
}) {
  return (
    <>
      {Object.entries(COLUMN_TYPE_META).map(([type, { label, Icon }]) => (
        <DropdownMenuItem key={type} onSelect={() => onPick(type)}>
          <Icon size={15} className="text-neutral-400" />
          {label}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/**
 * Per-type cell renderer/editor (doc 11 §C.4) — reused verbatim by the
 * table grid and the item panel facts grid (doc 11 §H.1).
 * Editable: status, text, long_text, number, date, checkbox.
 * Display-only until their pickers land: person, dropdown.
 */
export function Cell({
  column,
  cell,
  onSave,
}: {
  column: Column;
  cell: ColumnValue | undefined;
  onSave: (value: unknown) => void;
}) {
  // Remount uncontrolled inputs when the server value changes so
  // defaultValue stays in sync after refetches.
  const key = `${column.id}:${cell?.updatedAt ?? "empty"}`;

  switch (column.type) {
    case "status": {
      const labels = column.settings.labels ?? [];
      const current = labels.find(
        (l) =>
          l.id === (cell?.value as { label_id?: string } | undefined)?.label_id,
      );
      return (
        <Popover>
          <PopoverTrigger asChild>
            <StatusFill
              color={current?.color}
              ratio={statusFillRatio(labels, current?.id)}
              isDone={current?.is_done}
            >
              {current?.text ?? ""}
            </StatusFill>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1.5">
            <div className="space-y-0.5">
              {labels.map((l) => (
                <PopoverClose asChild key={l.id}>
                  <StatusFill
                    color={l.color}
                    ratio={statusFillRatio(labels, l.id)}
                    isDone={l.is_done}
                    onClick={() => onSave({ label_id: l.id })}
                  >
                    {l.text}
                  </StatusFill>
                </PopoverClose>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      );
    }
    case "text":
    case "long_text": {
      const current =
        (cell?.value as { text?: string } | undefined)?.text ?? "";
      return (
        <input
          key={key}
          defaultValue={current}
          placeholder="—"
          onBlur={(e) => {
            const next = e.target.value;
            // Clearing a cell (sparse-EAV delete) isn't implemented in
            // the API yet — only save non-empty changes.
            if (next !== current && next !== "") onSave({ text: next });
          }}
          className="h-7 w-full rounded-sm border border-transparent bg-transparent px-1.5 text-sm outline-none placeholder:text-neutral-300 hover:border-neutral-200 focus:border-brand-400"
        />
      );
    }
    case "number": {
      const current = (cell?.value as { number?: number } | undefined)?.number;
      return (
        <input
          key={key}
          type="number"
          step="any"
          defaultValue={current ?? ""}
          placeholder="—"
          onBlur={(e) => {
            const next = e.target.value;
            if (next !== "" && Number(next) !== current) {
              onSave({ number: Number(next) });
            }
          }}
          className="h-7 w-full rounded-sm border border-transparent bg-transparent px-1.5 text-right text-sm tabular-nums outline-none placeholder:text-neutral-300 hover:border-neutral-200 focus:border-brand-400"
        />
      );
    }
    case "date": {
      const current =
        (cell?.value as { date?: string } | undefined)?.date ?? "";
      return (
        <input
          key={key}
          type="date"
          defaultValue={current}
          onChange={(e) => {
            if (e.target.value) onSave({ date: e.target.value, time: null });
          }}
          className="h-7 w-full rounded-sm border border-transparent bg-transparent px-1.5 text-sm text-neutral-700 outline-none hover:border-neutral-200 focus:border-brand-400"
        />
      );
    }
    case "checkbox": {
      const checked =
        (cell?.value as { checked?: boolean } | undefined)?.checked ?? false;
      return (
        <div className="flex h-7 items-center justify-center">
          <input
            key={key}
            type="checkbox"
            checked={checked}
            onChange={(e) => onSave({ checked: e.target.checked })}
            className="h-4 w-4 cursor-pointer accent-brand-600"
          />
        </div>
      );
    }
    case "person": {
      const name = cell?.textValue;
      return name ? (
        <div className="flex h-7 items-center gap-1.5 px-1">
          <Avatar name={name} size={22} />
          <span className="truncate text-sm text-neutral-700">{name}</span>
        </div>
      ) : (
        <div className="flex h-7 items-center justify-center">
          <User size={15} className="text-neutral-300" />
        </div>
      );
    }
    default: {
      const text = cell?.textValue;
      return (
        <div className="flex h-7 items-center px-1">
          {text ? (
            <Badge className="truncate">{text}</Badge>
          ) : (
            <span className="text-sm text-neutral-300">—</span>
          )}
        </div>
      );
    }
  }
}
