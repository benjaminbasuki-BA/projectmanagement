import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Search, SquareKanban, Table } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  PageLoader,
  Skeleton,
  cn,
} from "@trellis/ui";
import * as api from "../../lib/api-client";
import type { ColumnValue, FilterGroup, Item } from "../../lib/api-client";
import { useBoard, useGroups, useColumns, useItems } from "../../lib/queries";
import { useShell } from "../../app/AppShell";
import { DEFAULT_STATUS_SETTINGS } from "./defaults";
import { recordRecentBoard } from "../../lib/recent-boards";
import { errorMessage } from "../../lib/errors";
import { COLUMN_TYPE_META, ColumnTypeMenuItems } from "../items/cells";
import { ItemPanel } from "../items/ItemPanel";
import { TableView } from "../views/table/TableView";
import { KanbanView } from "../views/kanban/KanbanView";
import { FilterBar } from "./FilterBar";

type ItemsPayload = { items: Item[]; columnValues: ColumnValue[] };

/**
 * Board screen orchestrator (doc 11 §C.1–2): header with inline rename,
 * view tabs (Table | Kanban), toolbar, and the route-synced item panel.
 * View renderers live in features/views/* (doc 06 §2).
 */
export function BoardPage() {
  const { boardId } = useParams() as { boardId: string };
  const queryClient = useQueryClient();
  const { workspaces } = useShell();
  const [searchParams, setSearchParams] = useSearchParams();

  const view = searchParams.get("view") === "kanban" ? "kanban" : "table";
  const panelItemId = searchParams.get("item");

  const setView = (v: "table" | "kanban") =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v === "table") p.delete("view");
        else p.set("view", v);
        return p;
      },
      { replace: true },
    );

  const openItem = (id: string | null) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (id) p.set("item", id);
        else p.delete("item");
        return p;
      },
      { replace: true },
    );

  const [filter, setFilter] = useState<FilterGroup>({ op: "and", rules: [] });

  const boardQuery = useBoard(boardId);
  const groupsQuery = useGroups(boardId);
  const columnsQuery = useColumns(boardId);
  const itemsQuery = useItems(boardId, filter);

  const board = boardQuery.data?.board;
  const groups = groupsQuery.data?.groups ?? [];
  const columns = columnsQuery.data?.columns ?? [];
  const items = itemsQuery.data?.items ?? [];
  const workspaceName = workspaces.find(
    (w) => w.id === board?.workspaceId,
  )?.name;

  const [search, setSearch] = useState("");
  const [renamingBoard, setRenamingBoard] = useState(false);

  // Reset filters when navigating to a different board — a filter built
  // for one board's columns is meaningless (and may reference column ids
  // that don't exist) on another.
  const [filterForBoard, setFilterForBoard] = useState(boardId);
  if (boardId !== filterForBoard) {
    setFilterForBoard(boardId);
    setFilter({ op: "and", rules: [] });
  }

  // Feed the Home "pick up where you left off" row (doc 11 §B.3).
  useEffect(() => {
    if (board) {
      recordRecentBoard({
        id: board.id,
        name: board.name,
        workspaceName: workspaceName ?? "",
      });
    }
  }, [board, workspaceName]);

  // itemId → columnId → cell
  const cellMap = useMemo(() => {
    const map = new Map<string, Map<string, ColumnValue>>();
    for (const cv of itemsQuery.data?.columnValues ?? []) {
      if (!map.has(cv.itemId)) map.set(cv.itemId, new Map());
      map.get(cv.itemId)!.set(cv.columnId, cv);
    }
    return map;
  }, [itemsQuery.data?.columnValues]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, search]);

  const itemsByGroup = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of visibleItems) {
      if (!map.has(item.groupId)) map.set(item.groupId, []);
      map.get(item.groupId)!.push(item);
    }
    return map;
  }, [visibleItems]);

  const renameBoard = useMutation({
    mutationFn: (name: string) => api.updateBoard(boardId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });

  const addColumn = useMutation({
    mutationFn: (type: string) =>
      api.createColumn(boardId, {
        title: COLUMN_TYPE_META[type]?.label ?? type,
        type,
        settings: type === "status" ? DEFAULT_STATUS_SETTINGS : {},
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["columns", boardId] }),
  });

  const addItem = useMutation({
    mutationFn: (input: {
      name: string;
      groupId: string;
      columnValues?: Record<string, unknown>;
    }) => api.createItem(boardId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["items", boardId] }),
  });

  const addGroup = useMutation({
    mutationFn: () =>
      api.createGroup(boardId, { title: `Group ${groups.length + 1}` }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["groups", boardId] }),
  });

  // Every cell edit is optimistic (doc 06 §6): cache first, request in
  // the background, rollback + refetch on failure.
  const setCell = useMutation({
    mutationFn: ({
      itemId,
      columnId,
      value,
    }: {
      itemId: string;
      columnId: string;
      value: unknown;
    }) => api.updateColumnValues(itemId, { [columnId]: value }),
    onMutate: async ({ itemId, columnId, value }) => {
      await queryClient.cancelQueries({ queryKey: ["items", boardId] });
      const prev = queryClient.getQueryData<ItemsPayload>(["items", boardId]);
      if (prev) {
        const updatedAt = new Date().toISOString();
        const existing = prev.columnValues.find(
          (cv) => cv.itemId === itemId && cv.columnId === columnId,
        );
        const columnValues = existing
          ? prev.columnValues.map((cv) =>
              cv === existing
                ? { ...cv, value: value as Record<string, unknown>, updatedAt }
                : cv,
            )
          : [
              ...prev.columnValues,
              {
                itemId,
                columnId,
                value: value as Record<string, unknown>,
                textValue: null,
                numberValue: null,
                dateValue: null,
                updatedAt,
              },
            ];
        queryClient.setQueryData(["items", boardId], { ...prev, columnValues });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["items", boardId], ctx.prev);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["items", boardId] }),
  });

  if (boardQuery.isPending) return <PageLoader />;
  if (!board) {
    return (
      <EmptyState
        className="min-h-[60vh]"
        icon={<SquareKanban size={18} />}
        title="Board not found"
        body="It may have been deleted, or the link is wrong."
      />
    );
  }

  const structurePending =
    groupsQuery.isPending || columnsQuery.isPending || itemsQuery.isPending;
  const error = errorMessage(
    addColumn.error ??
      addItem.error ??
      addGroup.error ??
      setCell.error ??
      renameBoard.error,
  );
  const saveCell = (itemId: string, columnId: string, value: unknown) =>
    setCell.mutate({ itemId, columnId, value });

  const panelItem = panelItemId
    ? items.find((i) => i.id === panelItemId)
    : undefined;

  const commitBoardName = (value: string) => {
    const name = value.trim();
    if (name && name !== board.name) renameBoard.mutate(name);
    setRenamingBoard(false);
  };

  return (
    <div className="flex min-h-full flex-col px-6 pt-5 pb-16 md:px-8">
      {/* Header */}
      <header>
        <div className="flex items-center gap-1 text-[13px] text-neutral-400">
          {workspaceName && (
            <>
              <span>{workspaceName}</span>
              <ChevronRight size={12} />
            </>
          )}
          <span className="text-neutral-500">{board.name}</span>
        </div>
        {renamingBoard ? (
          <input
            autoFocus
            defaultValue={board.name}
            className="mt-1 w-full max-w-xl border-b-2 border-ink bg-transparent font-serif text-[30px] tracking-tight text-ink outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") commitBoardName(e.currentTarget.value);
              if (e.key === "Escape") setRenamingBoard(false);
            }}
            onBlur={(e) => commitBoardName(e.target.value)}
          />
        ) : (
          <h1
            title="Click to rename"
            onClick={() => setRenamingBoard(true)}
            className="mt-1 -mx-1 inline-block cursor-text rounded-sm px-1 font-serif text-[30px] tracking-tight text-ink hover:bg-frame"
          >
            {board.name}
          </h1>
        )}
        <div className="mt-3 flex items-center border-b border-neutral-200">
          <ViewTab
            active={view === "table"}
            onClick={() => setView("table")}
            icon={<Table size={15} />}
          >
            Main table
          </ViewTab>
          <ViewTab
            active={view === "kanban"}
            onClick={() => setView("kanban")}
            icon={<SquareKanban size={15} />}
          >
            Kanban
          </ViewTab>
        </div>
      </header>

      {/* Toolbar */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={groups.length === 0 || addItem.isPending}
          onClick={() =>
            addItem.mutate({ name: "New item", groupId: groups[0]!.id })
          }
        >
          New item
        </Button>
        <div className="relative">
          <Search
            size={14}
            className="absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
          />
          <input
            className="h-8 w-52 rounded-sm border border-neutral-300 bg-white pr-2.5 pl-8 text-sm outline-none placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            placeholder="Search items"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={addColumn.isPending}>
              <Plus size={14} />
              Add column
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <ColumnTypeMenuItems onPick={(t) => addColumn.mutate(t)} />
          </DropdownMenuContent>
        </DropdownMenu>
        {columns.length > 0 && (
          <FilterBar columns={columns} filter={filter} onChange={setFilter} />
        )}
        <span className="ml-auto text-sm text-neutral-400">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {/* View canvas */}
      <div className="mt-5">
        {structurePending ? (
          <BoardSkeleton />
        ) : view === "kanban" ? (
          <KanbanView
            columns={columns}
            items={visibleItems}
            cellMap={cellMap}
            canAdd={groups.length > 0}
            onSaveCell={saveCell}
            onAddItem={(name, labelId) => {
              const statusCol = columns.find((c) => c.type === "status");
              addItem.mutate({
                name,
                groupId: groups[0]!.id,
                columnValues: statusCol
                  ? { [statusCol.id]: { label_id: labelId } }
                  : undefined,
              });
            }}
            onAddColumn={(t) => addColumn.mutate(t)}
            onOpenItem={openItem}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            className="rounded-xl border border-dashed border-neutral-300"
            icon={<SquareKanban size={18} />}
            title="This board is empty"
            body="Add a group to start creating items."
            action={
              <Button
                size="sm"
                onClick={() => addGroup.mutate()}
                disabled={addGroup.isPending}
              >
                <Plus size={14} />
                Add group
              </Button>
            }
          />
        ) : (
          <>
            <TableView
              boardId={boardId}
              groups={groups}
              columns={columns}
              itemsByGroup={itemsByGroup}
              cellMap={cellMap}
              onSaveCell={saveCell}
              onAddItem={(groupId, name) => addItem.mutate({ name, groupId })}
              onAddColumn={(t) => addColumn.mutate(t)}
              onOpenItem={openItem}
            />
            <button
              onClick={() => addGroup.mutate()}
              disabled={addGroup.isPending}
              className="mt-7 flex items-center gap-1.5 rounded-md border border-dashed border-neutral-300 px-3.5 py-2 text-sm text-neutral-400 transition hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
            >
              <Plus size={14} />
              Add group
            </button>
          </>
        )}
      </div>

      {/* Item detail slide-over (doc 11 §C.6) */}
      {panelItem && (
        <ItemPanel
          boardId={boardId}
          item={panelItem}
          columns={columns}
          cellMap={cellMap}
          onSaveCell={saveCell}
          onClose={() => openItem(null)}
        />
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium",
        active ? "text-brand-600" : "text-neutral-500 hover:text-neutral-700",
      )}
    >
      {icon}
      {children}
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-600" />
      )}
    </button>
  );
}

function BoardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xs">
      <div className="border-b border-neutral-200 bg-neutral-50/80 px-3 py-2.5">
        <Skeleton className="h-3.5 w-40" />
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-neutral-100 px-3 py-2.5 last:border-b-0"
        >
          <Skeleton className="h-3.5 w-[45%]" />
          <Skeleton className="h-3.5 w-[15%]" />
          <Skeleton className="h-3.5 w-[15%]" />
          <Skeleton className="h-3.5 w-[10%]" />
        </div>
      ))}
    </div>
  );
}
