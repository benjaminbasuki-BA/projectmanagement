import { useState } from "react";
import Papa from "papaparse";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, Button, cn } from "@trellis/ui";
import * as api from "../../lib/api-client";
import type { Column, Group } from "../../lib/api-client";

const PREVIEW_ROWS = 8;
const ITEM_NAME_TARGET = "__item_name__";
const SKIP_TARGET = "__skip__";

/**
 * doc11: "CsvImportWizard — 3 steps: upload → column mapping table →
 * preview/commit." Parsing and mapping both happen client-side (Papa
 * Parse); the server only ever sees already-resolved `{name,
 * columnValues}` rows (import.routes.ts), validated there the same way
 * a normal item create is.
 *
 * Import targets existing board columns only — creating a *new* board
 * from a CSV with inferred column types is a meaningfully bigger feature
 * (type-inference heuristics, a column-creation UI) that didn't fit this
 * pass; noting it rather than silently doing a smaller thing than the
 * name implies. `person` columns aren't offered as a mapping target
 * either — matching them would need resolving CSV text to real user ids
 * via the org directory, not just a value shape.
 */
export function CsvImportWizard({
  boardId,
  columns,
  groups,
  open,
  onOpenChange,
}: {
  boardId: string;
  columns: Column[];
  groups: Group[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [parseError, setParseError] = useState<string | null>(null);

  const mappableColumns = columns.filter((c) => c.type !== "person");

  const reset = () => {
    setStep(1);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setParseError(null);
  };

  const onFile = (file: File) => {
    setParseError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.data.length === 0) {
          setParseError("That file has no rows.");
          return;
        }
        const fields = result.meta.fields ?? [];
        setHeaders(fields);
        setRows(result.data);
        // Best-effort auto-mapping: exact (case-insensitive) header/title
        // match, "name"-ish headers to Item name — still fully editable
        // in the mapping step, this is just a head start.
        const initial: Record<string, string> = {};
        for (const header of fields) {
          const lower = header.trim().toLowerCase();
          if (lower === "name" || lower === "item" || lower === "title") {
            initial[header] = ITEM_NAME_TARGET;
            continue;
          }
          const match = mappableColumns.find(
            (c) => c.title.toLowerCase() === lower,
          );
          initial[header] = match ? match.id : SKIP_TARGET;
        }
        setMapping(initial);
        setStep(2);
      },
      error: (err) => setParseError(err.message),
    });
  };

  const nameHeader = headers.find((h) => mapping[h] === ITEM_NAME_TARGET);

  const buildRow = (row: Record<string, string>) => {
    const name = nameHeader ? row[nameHeader]?.trim() : "";
    const columnValues: Record<string, unknown> = {};
    const warnings: string[] = [];
    for (const header of headers) {
      const target = mapping[header];
      if (!target || target === SKIP_TARGET || target === ITEM_NAME_TARGET) {
        continue;
      }
      const column = mappableColumns.find((c) => c.id === target);
      if (!column) continue;
      const text = row[header]?.trim() ?? "";
      if (!text) continue;
      const resolved = resolveCsvValue(column, text);
      if (resolved === undefined) {
        warnings.push(`${header}: "${text}" didn't match ${column.title}`);
      } else {
        columnValues[column.id] = resolved;
      }
    }
    return { name, columnValues, warnings };
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const built = rows.map(buildRow).filter((r) => r.name);
      return api.importItems(boardId, {
        groupId,
        items: built.map((r) => ({
          name: r.name,
          columnValues: r.columnValues,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", boardId] });
      onOpenChange(false);
      reset();
    },
  });

  const validRowCount = rows.filter((r) => buildRow(r).name).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle>Import from CSV</DialogTitle>

        {step === 1 && (
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-500 hover:border-neutral-400">
              <span>Click to choose a .csv file</span>
              <span className="text-xs text-neutral-400">
                First row must be column headers
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFile(file);
                }}
              />
            </label>
            {parseError && <p className="text-sm text-red-600">{parseError}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-500">Import into group:</span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">CSV column</th>
                    <th className="px-3 py-2 font-medium">Sample</th>
                    <th className="px-3 py-2 font-medium">Maps to</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header) => (
                    <tr key={header} className="border-t border-neutral-100">
                      <td className="px-3 py-2 font-medium text-neutral-700">
                        {header}
                      </td>
                      <td className="max-w-40 truncate px-3 py-2 text-neutral-400">
                        {rows[0]?.[header] || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={mapping[header] ?? SKIP_TARGET}
                          onChange={(e) =>
                            setMapping((m) => ({
                              ...m,
                              [header]: e.target.value,
                            }))
                          }
                          className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-sm"
                        >
                          <option value={ITEM_NAME_TARGET}>Item name</option>
                          {mappableColumns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                          <option value={SKIP_TARGET}>Don't import</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!nameHeader && (
              <p className="text-sm text-amber-600">
                Map one column to "Item name" to continue.
              </p>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                size="sm"
                disabled={!nameHeader || !groupId}
                onClick={() => setStep(3)}
              >
                Preview
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-neutral-600">
              {validRowCount} of {rows.length} rows will be imported
              {rows.length - validRowCount > 0 &&
                ` (${rows.length - validRowCount} skipped — no item name)`}
              .
            </p>
            <div className="max-h-72 overflow-x-auto overflow-y-auto rounded-md border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Item</th>
                    {mappableColumns
                      .filter((c) => Object.values(mapping).includes(c.id))
                      .map((c) => (
                        <th key={c.id} className="px-3 py-2 font-medium">
                          {c.title}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_ROWS).map((row, i) => {
                    const built = buildRow(row);
                    return (
                      <tr key={i} className="border-t border-neutral-100">
                        <td
                          className={cn(
                            "px-3 py-2",
                            !built.name && "text-neutral-300 italic",
                          )}
                        >
                          {built.name || "(no name — skipped)"}
                        </td>
                        {mappableColumns
                          .filter((c) => Object.values(mapping).includes(c.id))
                          .map((c) => (
                            <td
                              key={c.id}
                              className="px-3 py-2 text-neutral-600"
                            >
                              {describeResolved(c, built.columnValues[c.id])}
                            </td>
                          ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > PREVIEW_ROWS && (
              <p className="text-xs text-neutral-400">
                Showing the first {PREVIEW_ROWS} of {rows.length} rows.
              </p>
            )}
            {importMutation.isError && (
              <p className="text-sm text-red-600">
                {importMutation.error instanceof api.ApiError
                  ? importMutation.error.message
                  : "Import failed."}
              </p>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                size="sm"
                disabled={validRowCount === 0 || importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                Import {validRowCount} {validRowCount === 1 ? "item" : "items"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Resolves one CSV cell's raw text into the column's Appendix A value
 * shape — `undefined` means "couldn't map this," not "empty." */
function resolveCsvValue(column: Column, text: string): unknown {
  switch (column.type) {
    case "text":
    case "long_text":
      return { text };
    case "number": {
      const n = Number(text.replace(/,/g, ""));
      return Number.isNaN(n) ? undefined : { number: n };
    }
    case "date": {
      const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
      return match ? { date: match[1], time: null } : undefined;
    }
    case "checkbox": {
      const lower = text.toLowerCase();
      if (["true", "yes", "y", "1", "x", "checked"].includes(lower)) {
        return { checked: true };
      }
      if (["false", "no", "n", "0"].includes(lower)) return { checked: false };
      return undefined;
    }
    case "status": {
      const label = column.settings.labels?.find(
        (l) => l.text.toLowerCase() === text.toLowerCase(),
      );
      return label ? { label_id: label.id } : undefined;
    }
    case "dropdown": {
      const option = column.settings.options?.find(
        (o) => o.text.toLowerCase() === text.toLowerCase(),
      );
      return option ? { option_ids: [option.id] } : undefined;
    }
    default:
      return undefined;
  }
}

function describeResolved(column: Column, value: unknown): string {
  if (value === undefined) return "—";
  const v = value as Record<string, unknown>;
  switch (column.type) {
    case "status":
      return (
        column.settings.labels?.find((l) => l.id === v.label_id)?.text ?? "—"
      );
    case "dropdown": {
      const ids = (v.option_ids as string[]) ?? [];
      return ids
        .map(
          (id) => column.settings.options?.find((o) => o.id === id)?.text ?? id,
        )
        .join(", ");
    }
    case "checkbox":
      return v.checked ? "Yes" : "No";
    case "date":
      return (v.date as string) ?? "—";
    case "number":
      return String(v.number ?? "—");
    default:
      return (v.text as string) ?? "—";
  }
}
