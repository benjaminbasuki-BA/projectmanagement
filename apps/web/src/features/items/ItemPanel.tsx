import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, X } from "lucide-react";
import { Badge } from "@trellis/ui";
import * as api from "../../lib/api-client";
import type { Column, ColumnValue, Item } from "../../lib/api-client";
import { Cell, COLUMN_TYPE_META } from "./cells";

/**
 * Item detail slide-over (doc 11 §C.6), route-synced via `?item=`.
 * MVP-partial: title + facts grid (the same Cell editors as the table)
 * + archive. Updates/Files/Activity tabs land with the comments API
 * (doc 08 sprints 5–6).
 */
export function ItemPanel({
  boardId,
  item,
  columns,
  cellMap,
  onSaveCell,
  onClose,
}: {
  boardId: string;
  item: Item;
  columns: Column[];
  cellMap: Map<string, Map<string, ColumnValue>>;
  onSaveCell: (itemId: string, columnId: string, value: unknown) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rename = useMutation({
    mutationFn: (name: string) => api.updateItem(item.id, { name }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["items", boardId] }),
  });

  const archive = useMutation({
    mutationFn: () => api.archiveItem(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", boardId] });
      onClose();
    },
  });

  const commitTitle = (value: string) => {
    const name = value.trim();
    if (name && name !== item.name) rename.mutate(name);
  };

  return (
    <aside className="animate-slide-in-right fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col border-l border-neutral-200 bg-white shadow-lg">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-100 px-5">
        <Badge>TRL-{item.displaySeq}</Badge>
        <div className="flex-1" />
        <button
          title="Archive item"
          onClick={() => archive.mutate()}
          disabled={archive.isPending}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
        >
          <Archive size={15} />
        </button>
        <button
          title="Close (Esc)"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <X size={16} />
        </button>
      </div>

      {/* Title */}
      <div className="px-5 pt-4">
        <input
          key={`${item.id}:${item.name}`}
          defaultValue={item.name}
          className="w-full rounded-sm bg-transparent text-lg font-semibold text-neutral-900 outline-none hover:bg-neutral-50 focus:bg-neutral-50"
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          onBlur={(e) => commitTitle(e.target.value)}
        />
      </div>

      {/* Facts grid — the same Cell editors as the table (doc 11 §H.1) */}
      <div className="flex-1 space-y-1 overflow-y-auto px-5 py-4">
        {columns.map((col) => {
          const meta = COLUMN_TYPE_META[col.type];
          return (
            <div
              key={col.id}
              className="grid grid-cols-[132px_1fr] items-center gap-2 py-1"
            >
              <span className="flex items-center gap-1.5 text-[13px] text-neutral-500">
                {meta && <meta.Icon size={13} className="text-neutral-400" />}
                <span className="truncate">{col.title}</span>
              </span>
              <Cell
                column={col}
                cell={cellMap.get(item.id)?.get(col.id)}
                onSave={(value) => onSaveCell(item.id, col.id, value)}
              />
            </div>
          );
        })}
        {columns.length === 0 && (
          <p className="py-4 text-sm text-neutral-400">
            No columns yet — add one from the board toolbar.
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-neutral-100 px-5 py-3 text-xs text-neutral-400">
        Updates, files & activity arrive with the comments API (Sprint 5–6).
      </div>
    </aside>
  );
}
