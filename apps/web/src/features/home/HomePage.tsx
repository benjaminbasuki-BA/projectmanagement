import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  Button,
  Input,
  PageLoader,
  Skeleton,
  cn,
  colorForString,
} from "@trellis/ui";
import * as api from "../../lib/api-client";
import type { Board, Column, ColumnValue, Item } from "../../lib/api-client";
import { useBoards, useWorkspaces } from "../../lib/queries";
import { useShell } from "../../app/AppShell";
import { useCreateBoard } from "../boards/useCreateBoard";
import { listRecentBoards, timeAgo } from "../../lib/recent-boards";
import { errorMessage } from "../../lib/errors";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Home is a launcher (doc 11 §B.3) — greeting, recents, board grid. */
export function HomePage() {
  const { me, workspace } = useShell();
  const workspacesQuery = useWorkspaces();
  const queryClient = useQueryClient();
  const recents = useMemo(() => listRecentBoards().slice(0, 4), []);

  const [firstWsName, setFirstWsName] = useState("");
  const createWs = useMutation({
    mutationFn: () => api.createWorkspace({ name: firstWsName }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  });

  if (workspacesQuery.isPending) return <PageLoader />;

  const firstName = me.user.name.split(/\s+/)[0] ?? me.user.name;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header>
        <p className="font-mono text-[11px] tracking-[0.1em] text-ink-faint uppercase">
          {me.organization?.name}
          {workspace ? ` · ${workspace.name}` : ""}
        </p>
        <h1 className="mt-2 font-serif text-[34px] leading-[1.1] tracking-tight text-ink">
          {greeting()}, {firstName}
        </h1>
      </header>

      {workspace && <StatRow workspaceId={workspace.id} />}

      {recents.length > 0 && workspace && (
        <section className="mt-9">
          <h2 className="mb-2 text-[10.5px] font-semibold tracking-[0.13em] text-ink-faint uppercase">
            Recently opened
          </h2>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {recents.map((r) => (
              <Link
                key={r.id}
                to={`/boards/${r.id}`}
                className="group flex items-baseline gap-2 text-sm"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 translate-y-px"
                  style={{ backgroundColor: colorForString(r.name) }}
                />
                <span className="text-ink group-hover:underline">{r.name}</span>
                <span className="font-mono text-[11px] text-ink-faint">
                  {timeAgo(r.at)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {workspace ? (
        <BoardsSection
          workspaceId={workspace.id}
          workspaceName={workspace.name}
        />
      ) : (
        <div className="mt-10 max-w-md rounded-sheet border border-rule bg-sheet p-6 shadow-sheet">
          <h2 className="mb-1 font-semibold text-neutral-900">
            Create your first workspace
          </h2>
          <p className="mb-4 text-sm text-neutral-500">
            Workspaces group related boards — one per team or department
            usually works well.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createWs.mutate();
            }}
          >
            <Input
              className="flex-1"
              placeholder="e.g. Marketing"
              value={firstWsName}
              onChange={(e) => setFirstWsName(e.target.value)}
              required
            />
            <Button type="submit" size="sm" disabled={createWs.isPending}>
              Create
            </Button>
          </form>
          {createWs.error && (
            <p className="mt-2 text-sm text-danger">
              {errorMessage(createWs.error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Home stat tiles. Every figure is computed from the items actually loaded —
 * no placeholder numbers, and deliberately no sparklines or trend deltas:
 * those need history the product doesn't record yet, so drawing them would
 * mean inventing data. Dashboards proper are V1 (CLAUDE.md); this is a
 * summary of the current workspace, not a dashboards module.
 */
function StatRow({ workspaceId }: { workspaceId: string }) {
  const boardsQuery = useBoards(workspaceId);
  const boards = boardsQuery.data?.boards ?? [];

  const results = useQueries({
    queries: boards.flatMap((b: Board) => [
      {
        queryKey: ["columns", b.id],
        queryFn: () => api.listColumns(b.id),
      },
      {
        queryKey: ["items", b.id],
        queryFn: () => api.listItems(b.id),
      },
    ]),
  });

  const loading = boardsQuery.isPending || results.some((r) => r.isPending);

  const stats = useMemo(() => {
    let inProgress = 0;
    let done = 0;
    let overdue = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < boards.length; i++) {
      const columns = (results[i * 2]?.data as { columns: Column[] } | undefined)
        ?.columns;
      const itemsData = results[i * 2 + 1]?.data as
        | { items: Item[]; columnValues: ColumnValue[] }
        | undefined;
      if (!columns || !itemsData) continue;

      const statusCol = columns.find((c) => c.type === "status");
      const dateCols = new Set(
        columns.filter((c) => c.type === "date").map((c) => c.id),
      );
      const doneLabels = new Set(
        (statusCol?.settings.labels ?? [])
          .filter((l) => l.is_done)
          .map((l) => l.id),
      );

      const byItem = new Map<string, ColumnValue[]>();
      for (const cv of itemsData.columnValues) {
        const list = byItem.get(cv.itemId);
        if (list) list.push(cv);
        else byItem.set(cv.itemId, [cv]);
      }

      for (const item of itemsData.items) {
        const cells = byItem.get(item.id) ?? [];
        const statusCell = statusCol
          ? cells.find((c) => c.columnId === statusCol.id)
          : undefined;
        const labelId = (statusCell?.value as { label_id?: string } | undefined)
          ?.label_id;
        const isDone = !!labelId && doneLabels.has(labelId);

        if (isDone) done++;
        else if (labelId) inProgress++;

        if (!isDone) {
          for (const cell of cells) {
            if (!dateCols.has(cell.columnId)) continue;
            const d = (cell.value as { date?: string } | undefined)?.date;
            if (d && d < today) {
              overdue++;
              break;
            }
          }
        }
      }
    }
    return { boards: boards.length, inProgress, done, overdue };
  }, [boards, results]);

  const figures = [
    { label: "Boards", value: stats.boards, alert: false },
    { label: "Active", value: stats.inProgress, alert: false },
    { label: "Complete", value: stats.done, alert: false },
    { label: "Past due", value: stats.overdue, alert: stats.overdue > 0 },
  ];

  // A ruled summary line, not a row of cards — figures read as a masthead
  // stat block the way a printed report sets them (design.md §5.3).
  return (
    <div className="mt-7 flex flex-wrap gap-x-12 gap-y-5 border-y border-rule py-5">
      {figures.map((f) => (
        <div key={f.label}>
          {loading ? (
            <Skeleton className="h-8 w-10" />
          ) : (
            <div
              className={cn(
                "font-serif text-[30px] leading-none tabular-nums",
                f.alert ? "text-alert" : "text-ink",
              )}
            >
              {f.value}
            </div>
          )}
          <div className="mt-1.5 text-[10.5px] font-semibold tracking-[0.13em] text-ink-faint uppercase">
            {f.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardsSection({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const boardsQuery = useBoards(workspaceId);
  const boards = boardsQuery.data?.boards ?? [];
  const createBoard = useCreateBoard(workspaceId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  return (
    <section className="mt-10">
      <div className="mb-2 flex items-baseline justify-between border-b border-ink pb-1.5">
        <h2 className="text-[10.5px] font-semibold tracking-[0.13em] text-ink uppercase">
          Boards in {workspaceName}
        </h2>
        <button
          onClick={() => setAdding(true)}
          className="text-[13px] font-medium text-deep hover:underline"
        >
          + New board
        </button>
      </div>

      {boardsQuery.isPending ? (
        <div className="divide-y divide-rule">
          <Skeleton className="my-3 h-5 w-56" />
          <Skeleton className="my-3 h-5 w-44" />
          <Skeleton className="my-3 h-5 w-64" />
        </div>
      ) : (
        /* A ruled index, not a card grid — a board list is a table of
           contents for the workspace (design.md §5.3). */
        <ul className="divide-y divide-rule">
          {boards.map((b) => (
            <li key={b.id}>
              <Link
                to={`/boards/${b.id}`}
                className="group flex items-baseline gap-3 py-2.5"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 translate-y-px"
                  style={{ backgroundColor: colorForString(b.name) }}
                />
                <span className="text-[15px] text-ink group-hover:underline">
                  {b.name}
                </span>
                <span className="ml-auto font-mono text-[11px] text-ink-faint">
                  Table · Kanban
                </span>
              </Link>
            </li>
          ))}

          {adding && (
            <li className="py-2">
              <Input
                autoFocus
                className="w-full max-w-sm"
                placeholder="Board name — press Enter"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) {
                    createBoard.mutate(name.trim());
                  }
                  if (e.key === "Escape") setAdding(false);
                }}
                onBlur={() => !name && setAdding(false)}
              />
            </li>
          )}
        </ul>
      )}

      {createBoard.error && (
        <p className="mt-3 text-sm text-danger">
          {errorMessage(createBoard.error)}
        </p>
      )}
    </section>
  );
}
