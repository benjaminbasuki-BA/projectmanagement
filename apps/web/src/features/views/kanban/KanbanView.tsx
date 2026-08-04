import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus, Tag } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  cn,
  labelTextColor,
} from "@trellis/ui";
import type {
  Column,
  ColumnValue,
  Item,
  StatusLabel,
} from "../../../lib/api-client";

export interface KanbanViewProps {
  columns: Column[];
  items: Item[];
  cellMap: Map<string, Map<string, ColumnValue>>;
  canAdd: boolean;
  onSaveCell: (itemId: string, columnId: string, value: unknown) => void;
  onAddItem: (name: string, labelId: string) => void;
  onAddColumn: (type: string) => void;
  onOpenItem: (itemId: string) => void;
}

/**
 * Kanban view (doc 11 §C.5): lanes from the board's first status
 * column; dragging a card to another lane writes that status via the
 * same optimistic cell mutation the table uses.
 */
export function KanbanView({
  columns,
  items,
  cellMap,
  canAdd,
  onSaveCell,
  onAddItem,
  onAddColumn,
  onOpenItem,
}: KanbanViewProps) {
  const statusColumn = columns.find((c) => c.type === "status");
  const labels = statusColumn?.settings.labels ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const labelOf = (itemId: string): string | undefined =>
    statusColumn
      ? (
          cellMap.get(itemId)?.get(statusColumn.id)?.value as
            | { label_id?: string }
            | undefined
        )?.label_id
      : undefined;

  const lanes = useMemo(() => {
    const byLabel = new Map<string, Item[]>(labels.map((l) => [l.id, []]));
    const noStatus: Item[] = [];
    for (const item of items) {
      const bucket = byLabel.get(labelOf(item.id) ?? "");
      if (bucket) bucket.push(item);
      else noStatus.push(item);
    }
    return { byLabel, noStatus };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cellMap, statusColumn?.id, labels]);

  if (!statusColumn) {
    return (
      <EmptyState
        className="rounded-xl border border-dashed border-neutral-300"
        icon={<Tag size={18} />}
        title="Kanban needs a status column"
        body="Lanes come from status labels — add one to use this view."
        action={
          <Button size="sm" onClick={() => onAddColumn("status")}>
            <Plus size={14} />
            Add a Status column
          </Button>
        }
      />
    );
  }

  const activeItem = activeId
    ? (items.find((i) => i.id === activeId) ?? null)
    : null;

  const handleDragStart = (e: DragStartEvent) =>
    setActiveId(e.active.id as string);

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id;
    if (typeof overId !== "string" || !overId.startsWith("lane:")) return;
    const labelId = overId.slice(5);
    const itemId = e.active.id as string;
    if (labelId && labelId !== labelOf(itemId)) {
      onSaveCell(itemId, statusColumn.id, { label_id: labelId });
    }
  };

  const dateColumn = columns.find((c) => c.type === "date");
  const personColumn = columns.find((c) => c.type === "person");

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex items-start gap-3 overflow-x-auto pb-4">
        {labels.map((label) => (
          <Lane
            key={label.id}
            label={label}
            items={lanes.byLabel.get(label.id) ?? []}
            cellMap={cellMap}
            dateColumn={dateColumn}
            personColumn={personColumn}
            activeId={activeId}
            canAdd={canAdd}
            onAddItem={(name) => onAddItem(name, label.id)}
            onOpenItem={onOpenItem}
          />
        ))}
        {lanes.noStatus.length > 0 && (
          <div className="w-72 shrink-0 rounded-lg border border-neutral-200 bg-neutral-50">
            <div className="border-t-[3px] border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-500">
              No status
              <Badge className="ml-2">{lanes.noStatus.length}</Badge>
            </div>
            <div className="space-y-2 p-2">
              {lanes.noStatus.map((item) => (
                <DraggableCard
                  key={item.id}
                  item={item}
                  cellMap={cellMap}
                  dateColumn={dateColumn}
                  personColumn={personColumn}
                  hidden={item.id === activeId}
                  onOpen={() => onOpenItem(item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeItem && (
          <div className="rotate-2 scale-[1.03]">
            <CardBody
              item={activeItem}
              cellMap={cellMap}
              dateColumn={dateColumn}
              personColumn={personColumn}
              className="shadow-lg"
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Lane({
  label,
  items,
  cellMap,
  dateColumn,
  personColumn,
  activeId,
  canAdd,
  onAddItem,
  onOpenItem,
}: {
  label: StatusLabel;
  items: Item[];
  cellMap: Map<string, Map<string, ColumnValue>>;
  dateColumn: Column | undefined;
  personColumn: Column | undefined;
  activeId: string | null;
  canAdd: boolean;
  onAddItem: (name: string) => void;
  onOpenItem: (itemId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `lane:${label.id}` });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex max-h-[calc(100vh-260px)] w-72 shrink-0 flex-col rounded-lg border bg-neutral-50 transition-colors",
        isOver ? "border-brand-400 bg-brand-50/60" : "border-neutral-200",
      )}
      style={{ borderTopWidth: 3, borderTopColor: label.color }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: label.color,
            color: labelTextColor(label.color),
          }}
        >
          {label.text}
        </span>
        <span className="text-xs text-neutral-400">{items.length}</span>
      </div>
      <div className="min-h-16 flex-1 space-y-2 overflow-y-auto p-2 pt-0">
        {items.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            cellMap={cellMap}
            dateColumn={dateColumn}
            personColumn={personColumn}
            hidden={item.id === activeId}
            onOpen={() => onOpenItem(item.id)}
          />
        ))}
        {items.length === 0 && !isOver && (
          <p className="px-2 py-4 text-center text-xs text-neutral-400">
            Drag items here
          </p>
        )}
      </div>
      {canAdd && (
        <div className="p-2 pt-0">
          {adding ? (
            <input
              autoFocus
              className="w-full rounded-md border border-brand-300 bg-white px-2.5 py-1.5 text-sm outline-none placeholder:text-neutral-400"
              placeholder="Item name — press Enter"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  onAddItem(name.trim());
                  setName("");
                }
                if (e.key === "Escape") setAdding(false);
              }}
              onBlur={() => !name && setAdding(false)}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-sm text-neutral-400 hover:bg-neutral-200/50 hover:text-neutral-600"
            >
              <Plus size={14} />
              Add
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DraggableCard({
  item,
  cellMap,
  dateColumn,
  personColumn,
  hidden,
  onOpen,
}: {
  item: Item;
  cellMap: Map<string, Map<string, ColumnValue>>;
  dateColumn: Column | undefined;
  personColumn: Column | undefined;
  hidden: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        hidden && "opacity-30",
      )}
    >
      <CardBody
        item={item}
        cellMap={cellMap}
        dateColumn={dateColumn}
        personColumn={personColumn}
        className="hover:shadow-md"
      />
    </div>
  );
}

function CardBody({
  item,
  cellMap,
  dateColumn,
  personColumn,
  className,
}: {
  item: Item;
  cellMap: Map<string, Map<string, ColumnValue>>;
  dateColumn: Column | undefined;
  personColumn: Column | undefined;
  className?: string;
}) {
  const date = dateColumn
    ? (
        cellMap.get(item.id)?.get(dateColumn.id)?.value as
          | { date?: string }
          | undefined
      )?.date
    : undefined;
  const person = personColumn
    ? cellMap.get(item.id)?.get(personColumn.id)?.textValue
    : undefined;

  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 bg-white p-3 shadow-xs transition-shadow",
        className,
      )}
    >
      <p className="line-clamp-2 text-sm text-neutral-800">{item.name}</p>
      <div className="mt-2 flex items-center gap-2">
        <Badge className="text-[10px]">TRL-{item.displaySeq}</Badge>
        {date && (
          <span className="text-xs text-neutral-400">
            {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
        {person && (
          <span className="ml-auto">
            <Avatar name={person} size={20} />
          </span>
        )}
      </div>
    </div>
  );
}
