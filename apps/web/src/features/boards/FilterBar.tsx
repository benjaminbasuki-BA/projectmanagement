import { useState } from "react";
import { Filter as FilterIcon, Plus, X } from "lucide-react";
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@trellis/ui";
import type { Column, FilterGroup, FilterRule } from "../../lib/api-client";

/**
 * Filter rule builder (doc 11 §I.4 toolbar spec, doc04 §3.4 comparator
 * matrix). Matches items/filter.ts on the backend — same comparator set
 * per column type, so nothing offered here can ever fail server-side
 * validation.
 *
 * Person filtering is deliberately trimmed to `is_me`/`is_empty` in this
 * builder (the backend also supports `is_any_of` a list of people, but
 * that needs its own user-search-multiselect — a bigger, separately
 * scoped piece of UI for a comparatively rare case next to "assigned to
 * me").
 */
type ValueKind =
  | "none"
  | "text"
  | "number"
  | "number-range"
  | "date"
  | "days"
  | "options"
  | "boolean";

interface ComparatorSpec {
  value: string;
  label: string;
  kind: ValueKind;
}

const COMPARATORS_BY_TYPE: Record<string, ComparatorSpec[]> = {
  text: [
    { value: "contains", label: "contains", kind: "text" },
    { value: "is", label: "is", kind: "text" },
    { value: "is_empty", label: "is empty", kind: "none" },
  ],
  long_text: [
    { value: "contains", label: "contains", kind: "text" },
    { value: "is", label: "is", kind: "text" },
    { value: "is_empty", label: "is empty", kind: "none" },
  ],
  number: [
    { value: "eq", label: "=", kind: "number" },
    { value: "neq", label: "≠", kind: "number" },
    { value: "gt", label: ">", kind: "number" },
    { value: "lt", label: "<", kind: "number" },
    { value: "between", label: "between", kind: "number-range" },
    { value: "is_empty", label: "is empty", kind: "none" },
  ],
  date: [
    { value: "is", label: "is", kind: "date" },
    { value: "before", label: "before", kind: "date" },
    { value: "after", label: "after", kind: "date" },
    { value: "last_n_days", label: "in the last N days", kind: "days" },
    { value: "next_n_days", label: "in the next N days", kind: "days" },
    { value: "overdue", label: "is overdue", kind: "none" },
    { value: "is_empty", label: "is empty", kind: "none" },
  ],
  status: [
    { value: "is_any_of", label: "is any of", kind: "options" },
    { value: "is_none_of", label: "is none of", kind: "options" },
  ],
  dropdown: [
    { value: "is_any_of", label: "is any of", kind: "options" },
    { value: "is_none_of", label: "is none of", kind: "options" },
  ],
  person: [
    { value: "is_me", label: "is me", kind: "none" },
    { value: "is_empty", label: "is empty", kind: "none" },
  ],
  checkbox: [{ value: "is", label: "is", kind: "boolean" }],
};

function optionsFor(column: Column): { id: string; text: string }[] {
  return column.type === "status"
    ? (column.settings.labels ?? [])
    : (column.settings.options ?? []);
}

function describeRule(rule: FilterRule, columns: Column[]): string {
  const column = columns.find((c) => c.id === rule.column_id);
  const title = column?.title ?? "?";
  const spec = COMPARATORS_BY_TYPE[column?.type ?? ""]?.find(
    (c) => c.value === rule.cmp,
  );
  const label = spec?.label ?? rule.cmp;
  if (spec?.kind === "options" && column) {
    const names = (rule.value as string[])
      .map((id) => optionsFor(column).find((o) => o.id === id)?.text ?? id)
      .join(", ");
    return `${title} ${label} ${names}`;
  }
  if (spec?.kind === "number-range" && Array.isArray(rule.value)) {
    return `${title} ${label} ${rule.value[0]}–${rule.value[1]}`;
  }
  if (spec?.kind === "boolean") {
    return `${title} is ${rule.value ? "checked" : "unchecked"}`;
  }
  if (spec?.kind === "days") {
    return `${title} ${label.replace("N", String(rule.value))}`;
  }
  if (spec?.kind === "none") return `${title} ${label}`;
  return `${title} ${label} ${rule.value}`;
}

export function FilterBar({
  columns,
  filter,
  onChange,
}: {
  columns: Column[];
  filter: FilterGroup;
  onChange: (next: FilterGroup) => void;
}) {
  const [open, setOpen] = useState(false);

  const addRule = (rule: FilterRule) => {
    onChange({ op: filter.op, rules: [...filter.rules, rule] });
    setOpen(false);
  };
  const removeRule = (index: number) => {
    onChange({
      op: filter.op,
      rules: filter.rules.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5">
            <FilterIcon size={13} />
            Filter
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <RuleForm columns={columns} onAdd={addRule} />
        </PopoverContent>
      </Popover>

      {filter.rules.length > 1 && (
        <button
          onClick={() =>
            onChange({
              op: filter.op === "and" ? "or" : "and",
              rules: filter.rules,
            })
          }
          className="rounded-sm px-1.5 py-0.5 text-xs font-medium text-neutral-400 uppercase hover:bg-neutral-100 hover:text-neutral-600"
          title="Toggle whether all filters must match, or any of them"
        >
          {filter.op}
        </button>
      )}

      {filter.rules.map((rule, i) => (
        <Badge key={i} className="gap-1 pr-1">
          <span className="truncate">{describeRule(rule, columns)}</span>
          <button
            onClick={() => removeRule(i)}
            className="rounded-full p-0.5 hover:bg-black/10"
          >
            <X size={11} />
          </button>
        </Badge>
      ))}
    </div>
  );
}

function RuleForm({
  columns,
  onAdd,
}: {
  columns: Column[];
  onAdd: (rule: FilterRule) => void;
}) {
  const [columnId, setColumnId] = useState(columns[0]?.id ?? "");
  const column = columns.find((c) => c.id === columnId);
  const comparators = COMPARATORS_BY_TYPE[column?.type ?? ""] ?? [];
  const [cmp, setCmp] = useState(comparators[0]?.value ?? "");
  const spec = comparators.find((c) => c.value === cmp);
  const [value, setValue] = useState<unknown>(undefined);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [rangeLow, setRangeLow] = useState("");
  const [rangeHigh, setRangeHigh] = useState("");

  const pickColumn = (id: string) => {
    setColumnId(id);
    const nextCol = columns.find((c) => c.id === id);
    const nextComparators = COMPARATORS_BY_TYPE[nextCol?.type ?? ""] ?? [];
    setCmp(nextComparators[0]?.value ?? "");
    setValue(undefined);
    setSelectedOptions([]);
  };

  const canSubmit =
    !!column &&
    !!spec &&
    (spec.kind !== "options" || selectedOptions.length > 0) &&
    (spec.kind !== "number-range" || (rangeLow !== "" && rangeHigh !== ""));

  const submit = () => {
    if (!column || !spec) return;
    let ruleValue: unknown = value;
    if (spec.kind === "options") ruleValue = selectedOptions;
    if (spec.kind === "number-range") {
      ruleValue = [Number(rangeLow), Number(rangeHigh)];
    }
    onAdd({ column_id: column.id, cmp, value: ruleValue });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <select
        value={columnId}
        onChange={(e) => pickColumn(e.target.value)}
        className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm"
      >
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>

      <select
        value={cmp}
        onChange={(e) => {
          setCmp(e.target.value);
          setValue(undefined);
          setSelectedOptions([]);
        }}
        className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm"
        disabled={comparators.length === 0}
      >
        {comparators.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      {spec?.kind === "text" && (
        <input
          autoFocus
          value={(value as string) ?? ""}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 rounded-md border border-neutral-200 px-2 text-sm outline-none focus:border-neutral-400"
          placeholder="Value"
        />
      )}
      {spec?.kind === "number" && (
        <input
          type="number"
          autoFocus
          value={(value as number) ?? ""}
          onChange={(e) => setValue(Number(e.target.value))}
          className="h-8 rounded-md border border-neutral-200 px-2 text-sm outline-none focus:border-neutral-400"
        />
      )}
      {spec?.kind === "number-range" && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            autoFocus
            value={rangeLow}
            onChange={(e) => setRangeLow(e.target.value)}
            className="h-8 w-full rounded-md border border-neutral-200 px-2 text-sm outline-none focus:border-neutral-400"
            placeholder="Low"
          />
          <span className="text-neutral-400">–</span>
          <input
            type="number"
            value={rangeHigh}
            onChange={(e) => setRangeHigh(e.target.value)}
            className="h-8 w-full rounded-md border border-neutral-200 px-2 text-sm outline-none focus:border-neutral-400"
            placeholder="High"
          />
        </div>
      )}
      {spec?.kind === "date" && (
        <input
          type="date"
          autoFocus
          value={(value as string) ?? ""}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 rounded-md border border-neutral-200 px-2 text-sm outline-none focus:border-neutral-400"
        />
      )}
      {spec?.kind === "days" && (
        <input
          type="number"
          min={0}
          autoFocus
          value={(value as number) ?? ""}
          onChange={(e) => setValue(Number(e.target.value))}
          className="h-8 rounded-md border border-neutral-200 px-2 text-sm outline-none focus:border-neutral-400"
          placeholder="Days"
        />
      )}
      {spec?.kind === "boolean" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={value === true ? "primary" : "outline"}
            onClick={() => setValue(true)}
          >
            Checked
          </Button>
          <Button
            size="sm"
            variant={value === false ? "primary" : "outline"}
            onClick={() => setValue(false)}
          >
            Unchecked
          </Button>
        </div>
      )}
      {spec?.kind === "options" && column && (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {optionsFor(column).map((opt) => {
            const checked = selectedOptions.includes(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() =>
                  setSelectedOptions((prev) =>
                    checked
                      ? prev.filter((id) => id !== opt.id)
                      : [...prev, opt.id],
                  )
                }
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                  checked ? "bg-neutral-100" : "hover:bg-neutral-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                    checked
                      ? "border-neutral-900 bg-neutral-900"
                      : "border-neutral-300",
                  )}
                >
                  {checked && (
                    <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />
                  )}
                </span>
                {opt.text}
              </button>
            );
          })}
          {optionsFor(column).length === 0 && (
            <p className="px-2 py-1 text-xs text-neutral-400">
              This column has no options yet.
            </p>
          )}
        </div>
      )}

      <Button
        size="sm"
        disabled={!canSubmit}
        onClick={submit}
        className="gap-1.5"
      >
        <Plus size={13} />
        Add filter
      </Button>
    </div>
  );
}
