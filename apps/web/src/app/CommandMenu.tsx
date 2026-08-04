import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home,
  LayoutGrid,
  PanelLeft,
  Search,
  SquareKanban,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, cn } from "@trellis/ui";
import type { Workspace } from "../lib/api-client";
import { useBoards } from "../lib/queries";

interface Command {
  id: string;
  section: string;
  label: string;
  icon: ReactNode;
  run: () => void;
}

/**
 * ⌘K command palette (doc 11 §I.4): jump to boards, switch workspaces,
 * run shell actions. Board-level FTS and NL search (doc 09 §3.9) layer
 * into this same surface in later sprints.
 */
export function CommandMenu({
  open,
  onOpenChange,
  workspaces,
  workspace,
  onSelectWorkspace,
  onToggleSidebar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: Workspace[];
  workspace: Workspace | undefined;
  onSelectWorkspace: (id: string) => void;
  onToggleSidebar: () => void;
}) {
  const navigate = useNavigate();
  const boardsQuery = useBoards(workspace?.id);
  const boards = boardsQuery.data?.boards ?? [];

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  // Resetting during render (React's documented pattern for state that
  // depends on a prop) rather than in an effect — an effect here would
  // commit the still-stale query/active for one frame before clearing.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
    }
  }

  const commands = useMemo<Command[]>(
    () => [
      ...boards.map((b) => ({
        id: `board-${b.id}`,
        section: "Boards",
        label: b.name,
        icon: <SquareKanban size={15} className="text-neutral-400" />,
        run: () => navigate(`/boards/${b.id}`),
      })),
      ...workspaces
        .filter((w) => w.id !== workspace?.id)
        .map((w) => ({
          id: `ws-${w.id}`,
          section: "Workspaces",
          label: `Switch to ${w.name}`,
          icon: <LayoutGrid size={15} className="text-neutral-400" />,
          run: () => {
            onSelectWorkspace(w.id);
            navigate("/");
          },
        })),
      {
        id: "go-home",
        section: "Actions",
        label: "Go home",
        icon: <Home size={15} className="text-neutral-400" />,
        run: () => navigate("/"),
      },
      {
        id: "toggle-sidebar",
        section: "Actions",
        label: "Toggle sidebar",
        icon: <PanelLeft size={15} className="text-neutral-400" />,
        run: onToggleSidebar,
      },
    ],
    [
      boards,
      workspaces,
      workspace?.id,
      navigate,
      onSelectWorkspace,
      onToggleSidebar,
    ],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? commands.filter((c) => c.label.toLowerCase().includes(q))
      : commands;
  }, [commands, query]);

  const activeIndex = Math.min(active, Math.max(0, filtered.length - 1));

  const runCommand = (cmd: Command | undefined) => {
    if (!cmd) return;
    onOpenChange(false);
    cmd.run();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent position="top" className="max-w-xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <div className="flex items-center gap-2.5 border-b border-neutral-100 px-4">
          <Search size={16} className="shrink-0 text-neutral-400" />
          <input
            autoFocus
            className="h-12 flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
            placeholder="Search boards, workspaces, actions…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, filtered.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                runCommand(filtered[activeIndex]);
              }
            }}
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-neutral-400">
              No results for “{query}”
            </p>
          )}
          {filtered.map((cmd, i) => (
            <div key={cmd.id}>
              {(i === 0 || filtered[i - 1]!.section !== cmd.section) && (
                <p className="px-3 pt-2 pb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">
                  {cmd.section}
                </p>
              )}
              <button
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-neutral-700",
                  i === activeIndex && "bg-neutral-100",
                )}
                onMouseEnter={() => setActive(i)}
                onClick={() => runCommand(cmd)}
              >
                {cmd.icon}
                <span className="truncate">{cmd.label}</span>
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
