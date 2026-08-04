import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LABEL_PALETTE,
  StatusDistribution,
  cn,
} from "@trellis/ui";
import * as api from "../../../lib/api-client";
import type { Column, ColumnValue, Group, Item } from "../../../lib/api-client";
import { positionBetween } from "../../../lib/position";
import { Cell, COLUMN_TYPE_META, ColumnTypeMenuItems } from "../../items/cells";

const GROUP_FALLBACK_COLOR = "#579BFC";
const DEFAULT_COL_WIDTH = 160;
const DENSITY_KEY = "trellis.density";

type ItemsPayload = { items: Item[]; columnValues: ColumnValue[] };

export interface TableViewProps {
  boardId: string;
  groups: Group[];
  columns: Column[];
  itemsByGroup: Map<string, Item[]>;
  cellMap: Map<string, Map<string, ColumnValue>>;
  onSaveCell: (itemId: string, columnId: string, value: unknown) => void;
  onAddItem: (groupId: string, name: string) => void;
  onAddColumn: (type: string) => void;
  onOpenItem: (itemId: string) => void;
}

/**
 * Table view v2 (doc 11 §C.3): selection + bulk bar, column
 * rename/resize/delete, row drag-reorder (one fractional-position
 * write), inline item rename, group rename/recolor/delete.
 */
export function TableView({
  boardId,
  groups,
  columns,
  itemsByGroup,
  cellMap,
  onSaveCell,
  onAddItem,
  onAddColumn,
  onOpenItem,
}: TableViewProps) {
  const queryClient = useQueryClient();

  // Column widths: local while dragging, persisted via PATCH on release.
  const [widths, setWidths] = useState<Record<string, number>>({});
  const widthOf = (col: Column) =>
    widths[col.id] ?? col.width ?? DEFAULT_COL_WIDTH;

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Reset during render rather than in an effect — see CommandMenu.tsx for
  // why (React's documented pattern for state derived from a prop change).
  const [selectedForBoard, setSelectedForBoard] = useState(boardId);
  if (boardId !== selectedForBoard) {
    setSelectedForBoard(boardId);
    setSelected(new Set());
  }

  // Editorial framing, instrument density on demand (design.md §5.3):
  // the grid tightens when you're working in it, without the page around
  // it changing character. Persisted because it's a working preference.
  const [compact, setCompact] = useState(
    () => localStorage.getItem(DENSITY_KEY) === "compact",
  );
  const toggleDensity = () =>
    setCompact((c) => {
      localStorage.setItem(DENSITY_KEY, c ? "comfortable" : "compact");
      return !c;
    });

  const toggleSelected = (itemId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

  const patchColumn = useMutation({
    mutationFn: ({
      columnId,
      input,
    }: {
      columnId: string;
      input: { title?: string; width?: number };
    }) => api.updateColumn(columnId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["columns", boardId] }),
  });

  const removeColumn = useMutation({
    mutationFn: (columnId: string) => api.deleteColumn(columnId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["columns", boardId] }),
  });

  const patchGroup = useMutation({
    mutationFn: ({
      groupId,
      input,
    }: {
      groupId: string;
      input: { title?: string; color?: string };
    }) => api.updateGroup(groupId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["groups", boardId] }),
  });

  const removeGroup = useMutation({
    mutationFn: (groupId: string) => api.deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups", boardId] });
      queryClient.invalidateQueries({ queryKey: ["items", boardId] });
    },
  });

  const renameItem = useMutation({
    mutationFn: ({ itemId, name }: { itemId: string; name: string }) =>
      api.updateItem(itemId, { name }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["items", boardId] }),
  });

  // Reorder = one fractional-position write (docs/02 §0), optimistic.
  const moveItem = useMutation({
    mutationFn: ({ itemId, position }: { itemId: string; position: string }) =>
      api.updateItem(itemId, { position }),
    onMutate: async ({ itemId, position }) => {
      await queryClient.cancelQueries({ queryKey: ["items", boardId] });
      const prev = queryClient.getQueryData<ItemsPayload>(["items", boardId]);
      if (prev) {
        const items = prev.items
          .map((i) => (i.id === itemId ? { ...i, position } : i))
          .sort((a, b) => (a.position < b.position ? -1 : 1));
        queryClient.setQueryData(["items", boardId], { ...prev, items });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["items", boardId], ctx.prev);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["items", boardId] }),
  });

  const archiveSelected = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => api.archiveItem(id))),
    onSuccess: () => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["items", boardId] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const groupId = active.data.current?.groupId as string | undefined;
    if (!groupId || over.data.current?.groupId !== groupId) return;

    const arr = itemsByGroup.get(groupId) ?? [];
    const oldIndex = arr.findIndex((i) => i.id === active.id);
    const newIndex = arr.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const moved = arrayMove(arr, oldIndex, newIndex);
    const idx = moved.findIndex((i) => i.id === active.id);
    const position = positionBetween(
      moved[idx - 1]?.position,
      moved[idx + 1]?.position,
    );
    moveItem.mutate({ itemId: active.id as string, position });
  };

  const statusColumn = columns.find((c) => c.type === "status");

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="mb-2 flex justify-end">
        <button
          onClick={toggleDensity}
          className="font-mono text-[11px] text-ink-faint hover:text-ink"
          title="Toggle row density"
        >
          {compact ? "density: compact" : "density: comfortable"}
        </button>
      </div>
      <div className="space-y-8">
        {groups.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            compact={compact}
            columns={columns}
            items={itemsByGroup.get(group.id) ?? []}
            cellMap={cellMap}
            widthOf={widthOf}
            setWidths={setWidths}
            selected={selected}
            onToggleSelected={toggleSelected}
            onSaveCell={onSaveCell}
            onAddItem={onAddItem}
            onAddColumn={onAddColumn}
            onOpenItem={onOpenItem}
            onRenameItem={(itemId, name) => renameItem.mutate({ itemId, name })}
            onPatchColumn={(columnId, input) =>
              patchColumn.mutate({ columnId, input })
            }
            onRemoveColumn={(columnId, title) => {
              if (
                window.confirm(
                  `Delete the "${title}" column? Its values are kept for 30 days.`,
                )
              ) {
                removeColumn.mutate(columnId);
              }
            }}
            onPatchGroup={(groupId, input) =>
              patchGroup.mutate({ groupId, input })
            }
            onRemoveGroup={(g, count) => {
              if (
                window.confirm(
                  `Delete "${g.title}"${count ? ` and its ${count} item(s)` : ""}? Recoverable for 30 days.`,
                )
              ) {
                removeGroup.mutate(g.id);
              }
            }}
          />
        ))}
      </div>

      {/* Floating bulk-action bar (doc 11 §C.3) */}
      {selected.size > 0 && (
        <div className="animate-panel-in fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white py-1.5 pr-2 pl-4 shadow-lg">
            <span className="text-sm font-medium text-neutral-800">
              {selected.size} selected
            </span>
            <div className="mx-2 h-5 w-px bg-neutral-200" />
            {statusColumn &&
              (statusColumn.settings.labels?.length ?? 0) > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      Set status
                      <ChevronDown size={13} className="opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="center"
                    side="top"
                    className="w-44"
                  >
                    {statusColumn.settings.labels!.map((l) => (
                      <DropdownMenuItem
                        key={l.id}
                        onSelect={() => {
                          for (const id of selected) {
                            onSaveCell(id, statusColumn.id, { label_id: l.id });
                          }
                        }}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: l.color }}
                        />
                        {l.text}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            <Button
              variant="ghost"
              size="sm"
              disabled={archiveSelected.isPending}
              onClick={() => archiveSelected.mutate([...selected])}
            >
              <Archive size={14} />
              Archive
            </Button>
            <button
              title="Clear selection"
              onClick={() => setSelected(new Set())}
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </DndContext>
  );
}

function GroupSection({
  group,
  compact,
  columns,
  items,
  cellMap,
  widthOf,
  setWidths,
  selected,
  onToggleSelected,
  onSaveCell,
  onAddItem,
  onAddColumn,
  onOpenItem,
  onRenameItem,
  onPatchColumn,
  onRemoveColumn,
  onPatchGroup,
  onRemoveGroup,
}: {
  group: Group;
  compact: boolean;
  columns: Column[];
  items: Item[];
  cellMap: Map<string, Map<string, ColumnValue>>;
  widthOf: (col: Column) => number;
  setWidths: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  selected: ReadonlySet<string>;
  onToggleSelected: (itemId: string) => void;
  onSaveCell: (itemId: string, columnId: string, value: unknown) => void;
  onAddItem: (groupId: string, name: string) => void;
  onAddColumn: (type: string) => void;
  onOpenItem: (itemId: string) => void;
  onRenameItem: (itemId: string, name: string) => void;
  onPatchColumn: (
    columnId: string,
    input: { title?: string; width?: number },
  ) => void;
  onRemoveColumn: (columnId: string, title: string) => void;
  onPatchGroup: (
    groupId: string,
    input: { title?: string; color?: string },
  ) => void;
  onRemoveGroup: (group: Group, itemCount: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const color = group.color || GROUP_FALLBACK_COLOR;

  // Status distribution for the collapsed-group summary bar (doc 11 §C.3).
  const statusColumn = columns.find((c) => c.type === "status");
  const distribution = useMemo(() => {
    if (!statusColumn) return [];
    const counts = new Map<string, number>();
    for (const item of items) {
      const labelId = (
        cellMap.get(item.id)?.get(statusColumn.id)?.value as
          { label_id?: string } | undefined
      )?.label_id;
      if (labelId) counts.set(labelId, (counts.get(labelId) ?? 0) + 1);
    }
    return (statusColumn.settings.labels ?? [])
      .map((l) => ({
        id: l.id,
        text: l.text,
        color: l.color,
        count: counts.get(l.id) ?? 0,
      }))
      .filter((d) => d.count > 0);
  }, [items, cellMap, statusColumn]);

  const commitGroupTitle = (value: string) => {
    const title = value.trim();
    if (title && title !== group.title) onPatchGroup(group.id, { title });
    setRenaming(false);
  };

  return (
    <section>
      <div className="group/hdr mb-2 flex items-center gap-1.5">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5"
          style={{ color }}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          {!renaming && (
            <span className="font-serif text-[17px] tracking-tight">
              {group.title}
            </span>
          )}
        </button>
        {renaming && (
          <input
            autoFocus
            defaultValue={group.title}
            className="rounded-sm border-b-2 border-brand-400 bg-transparent text-[15px] font-semibold outline-none"
            style={{ color }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitGroupTitle(e.currentTarget.value);
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={(e) => commitGroupTitle(e.target.value)}
          />
        )}
        <span className="ml-1 font-mono text-[13px] text-ink-muted">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Group options"
              className="flex h-6 w-6 items-center justify-center rounded-sm text-neutral-400 opacity-0 group-hover/hdr:opacity-100 hover:bg-neutral-100 hover:text-neutral-600 data-[state=open]:opacity-100"
            >
              <Ellipsis size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <div className="grid grid-cols-10 gap-1 p-2">
              {LABEL_PALETTE.map((c) => (
                <button
                  key={c}
                  title={c}
                  onClick={() => onPatchGroup(group.id, { color: c })}
                  className={cn(
                    "h-4 w-4 rounded-sm transition-transform hover:scale-125",
                    c === group.color &&
                      "ring-2 ring-neutral-400 ring-offset-1",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil size={14} className="text-neutral-400" />
              Rename group
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onRemoveGroup(group, items.length)}
            >
              <Trash2 size={14} className="text-neutral-400" />
              Delete group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* The signature's aggregate form — same grammar as a single cell
          (design.md §10). This is the only "chart" MVP needs. */}
      {distribution.length > 0 && (
        <div className="mb-2 ml-[22px] flex flex-wrap items-center gap-3">
          <StatusDistribution
            segments={distribution}
            total={items.length}
            className="w-40 shrink-0"
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[13px] text-ink-muted">
            {distribution.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-fill"
                  style={{ backgroundColor: d.color }}
                />
                {d.text} · {d.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ruled like a printed table: hairlines, no card, no shadow, and a
          heavy rule under the header (design.md §5.3). */}
      {!collapsed && (
        <div className="overflow-x-auto border-t-2 border-ink bg-paper">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink">
                <th className="w-8 px-2 py-1.5" />
                <th className="w-[300px] min-w-[220px] px-1 py-1.5 text-left text-[10.5px] font-semibold tracking-[0.1em] text-ink-muted uppercase">
                  Item
                </th>
                {columns.map((col) => (
                  <ColumnHeader
                    key={col.id}
                    column={col}
                    width={widthOf(col)}
                    onResize={(w) =>
                      setWidths((prev) => ({ ...prev, [col.id]: w }))
                    }
                    onResizeEnd={(w) =>
                      onPatchColumn(col.id, { width: Math.round(w) })
                    }
                    onRename={(title) => onPatchColumn(col.id, { title })}
                    onDelete={() => onRemoveColumn(col.id, col.title)}
                  />
                ))}
                <th className="w-10 px-2 py-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        title="Add column"
                        className="flex h-6 w-6 items-center justify-center rounded-sm text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-600"
                      >
                        <Plus size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48" align="end">
                      <ColumnTypeMenuItems onPick={onAddColumn} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </th>
              </tr>
            </thead>
            <tbody>
              <SortableContext
                items={items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    group={group}
                    compact={compact}
                    columns={columns}
                    cellMap={cellMap}
                    color={color}
                    widthOf={widthOf}
                    isSelected={selected.has(item.id)}
                    anySelected={selected.size > 0}
                    onToggleSelected={() => onToggleSelected(item.id)}
                    onSaveCell={onSaveCell}
                    onOpenItem={() => onOpenItem(item.id)}
                    onRenameItem={(name) => onRenameItem(item.id, name)}
                  />
                ))}
              </SortableContext>
              <tr>
                <td
                  colSpan={columns.length + 3}
                  className="px-3 py-1.5"
                  style={{ boxShadow: `inset 3px 0 0 ${color}55` }}
                >
                  <input
                    className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
                    placeholder="+ Add item"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newName.trim()) {
                        e.preventDefault();
                        onAddItem(group.id, newName.trim());
                        setNewName("");
                      }
                    }}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ColumnHeader({
  column,
  width,
  onResize,
  onResizeEnd,
  onRename,
  onDelete,
}: {
  column: Column;
  width: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const meta = COLUMN_TYPE_META[column.type];

  const commit = (value: string) => {
    const title = value.trim();
    if (title && title !== column.title) onRename(title);
    setRenaming(false);
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const clamp = (w: number) => Math.max(90, Math.min(600, w));
    const onMove = (ev: PointerEvent) =>
      onResize(clamp(startWidth + ev.clientX - startX));
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onResizeEnd(clamp(startWidth + ev.clientX - startX));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <th
      className="group/col relative px-3 py-1.5 text-left text-[10.5px] font-semibold tracking-[0.1em] text-ink-muted uppercase"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      {renaming ? (
        <input
          autoFocus
          defaultValue={column.title}
          className="w-full rounded-sm border-b-2 border-brand-400 bg-transparent text-xs font-medium outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget.value);
            if (e.key === "Escape") setRenaming(false);
          }}
          onBlur={(e) => commit(e.target.value)}
        />
      ) : (
        <span className="flex items-center gap-1.5">
          {meta && (
            <meta.Icon size={13} className="shrink-0 text-neutral-400" />
          )}
          <span className="truncate">{column.title}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title="Column options"
                className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-neutral-400 opacity-0 group-hover/col:opacity-100 hover:bg-neutral-200/60 data-[state=open]:opacity-100"
              >
                <ChevronDown size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil size={14} className="text-neutral-400" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete}>
                <Trash2 size={14} className="text-neutral-400" />
                Delete column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
      {/* Resize handle (doc 11 §C.3) */}
      <span
        onPointerDown={startResize}
        className="absolute top-0 -right-0.5 z-10 h-full w-1.5 cursor-col-resize hover:bg-brand-400"
      />
    </th>
  );
}

function SortableRow({
  item,
  group,
  compact,
  columns,
  cellMap,
  color,
  widthOf,
  isSelected,
  anySelected,
  onToggleSelected,
  onSaveCell,
  onOpenItem,
  onRenameItem,
}: {
  item: Item;
  group: Group;
  compact: boolean;
  columns: Column[];
  cellMap: Map<string, Map<string, ColumnValue>>;
  color: string;
  widthOf: (col: Column) => number;
  isSelected: boolean;
  anySelected: boolean;
  onToggleSelected: () => void;
  onSaveCell: (itemId: string, columnId: string, value: unknown) => void;
  onOpenItem: () => void;
  onRenameItem: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { groupId: group.id } });

  const commit = (value: string) => {
    const name = value.trim();
    if (name && name !== item.name) onRenameItem(name);
    setRenaming(false);
  };

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group border-b border-rule hover:bg-frame/50",
        compact ? "h-[30px]" : "h-[38px]",
        isDragging && "relative z-10 bg-paper shadow-drag",
        isSelected && "bg-deep-wash",
      )}
    >
      <td className="w-8 px-2 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelected}
          className={cn(
            "h-4 w-4 cursor-pointer accent-brand-600",
            !isSelected && !anySelected && "opacity-0 group-hover:opacity-100",
          )}
        />
      </td>
      <td className="px-1" style={{ boxShadow: `inset 2px 0 0 ${color}` }}>
        <div className="flex items-center gap-1">
          <button
            title="Drag to reorder"
            {...attributes}
            {...listeners}
            className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-neutral-300 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
          >
            <GripVertical size={13} />
          </button>
          {renaming ? (
            <input
              autoFocus
              defaultValue={item.name}
              className="w-full rounded-sm border-b-2 border-brand-400 bg-transparent text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(e.currentTarget.value);
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={(e) => commit(e.target.value)}
            />
          ) : (
            <>
              <button
                onClick={onOpenItem}
                className="truncate text-left text-neutral-800 hover:text-brand-700 hover:underline"
              >
                {item.name}
              </button>
              <button
                title="Rename"
                onClick={() => setRenaming(true)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-neutral-300 opacity-0 group-hover:opacity-100 hover:bg-neutral-200/60 hover:text-neutral-500"
              >
                <Pencil size={12} />
              </button>
              <Badge className="ml-auto hidden shrink-0 text-[10px] group-hover:inline-flex">
                TRL-{item.displaySeq}
              </Badge>
            </>
          )}
        </div>
      </td>
      {columns.map((col) => (
        <td
          key={col.id}
          className="px-1.5"
          style={{
            width: widthOf(col),
            minWidth: widthOf(col),
            maxWidth: widthOf(col),
          }}
        >
          <Cell
            column={col}
            cell={cellMap.get(item.id)?.get(col.id)}
            onSave={(value) => onSaveCell(item.id, col.id, value)}
          />
        </td>
      ))}
      <td />
    </tr>
  );
}
