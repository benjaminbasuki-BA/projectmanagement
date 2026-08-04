import { useEffect, useState } from "react";
import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronsUpDown,
  Home,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
} from "lucide-react";
import {
  Avatar,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Skeleton,
  cn,
  colorForString,
} from "@trellis/ui";
import * as api from "../lib/api-client";
import type { Me, Workspace } from "../lib/api-client";
import { useMe, useWorkspaces, useBoards } from "../lib/queries";
import { CreateOrgScreen } from "../features/home/CreateOrgScreen";
import { useCreateBoard } from "../features/boards/useCreateBoard";
import { TopBar } from "./TopBar";
import { CommandMenu } from "./CommandMenu";

/**
 * Persistent app frame (doc 11 §B.1): collapsible left sidebar
 * (workspace switcher, pinned nav, board tree) + TopBar + routed pages.
 * Workspace selection is client state until the /w/{workspaceSlug}
 * route prefix lands (doc 06 §3).
 */

export interface ShellContext {
  me: Me;
  workspace: Workspace | undefined;
  workspaces: Workspace[];
}

export function useShell() {
  return useOutletContext<ShellContext>();
}

const SIDEBAR_KEY = "trellis.sidebar";

export function AppShell() {
  const { data: me } = useMe();
  const workspacesQuery = useWorkspaces();
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === "collapsed",
  );
  const [paletteOpen, setPaletteOpen] = useState(false);

  const toggleSidebar = () =>
    setCollapsed((c) => {
      localStorage.setItem(SIDEBAR_KEY, c ? "expanded" : "collapsed");
      return !c;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // RequireAuth (router.tsx) guarantees `me` is loaded and non-null.
  if (!me) return null;
  if (!me.activeOrgId) return <CreateOrgScreen />;

  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const workspace =
    workspaces.find((w) => w.id === selectedWsId) ?? workspaces[0];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        me={me}
        workspaces={workspaces}
        workspacesPending={workspacesQuery.isPending}
        workspace={workspace}
        collapsed={collapsed}
        onToggle={toggleSidebar}
        onSelectWorkspace={setSelectedWsId}
        onOpenSearch={() => setPaletteOpen(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          me={me}
          workspace={workspace}
          onOpenSearch={() => setPaletteOpen(true)}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet
            context={{ me, workspace, workspaces } satisfies ShellContext}
          />
        </main>
      </div>
      <CommandMenu
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        workspaces={workspaces}
        workspace={workspace}
        onSelectWorkspace={setSelectedWsId}
        onToggleSidebar={toggleSidebar}
      />
    </div>
  );
}

function Monogram({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: colorForString(name),
      }}
    />
  );
}

function Sidebar({
  me,
  workspaces,
  workspacesPending,
  workspace,
  collapsed,
  onToggle,
  onSelectWorkspace,
  onOpenSearch,
}: {
  me: Me;
  workspaces: Workspace[];
  workspacesPending: boolean;
  workspace: Workspace | undefined;
  collapsed: boolean;
  onToggle: () => void;
  onSelectWorkspace: (id: string) => void;
  onOpenSearch: () => void;
}) {
  const queryClient = useQueryClient();
  const boardsQuery = useBoards(workspace?.id);
  const boards = boardsQuery.data?.boards ?? [];

  const [wsDialogOpen, setWsDialogOpen] = useState(false);
  const [wsName, setWsName] = useState("");
  const createWs = useMutation({
    mutationFn: () => api.createWorkspace({ name: wsName }),
    onSuccess: ({ workspace }) => {
      setWsName("");
      setWsDialogOpen(false);
      onSelectWorkspace(workspace.id);
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const [addingBoard, setAddingBoard] = useState(false);
  const [boardName, setBoardName] = useState("");
  const createBoard = useCreateBoard(workspace?.id);

  const navItemCls = (isActive: boolean) =>
    cn(
      "flex items-center gap-2.5 px-3 py-1.5 text-[13.5px] transition-colors",
      collapsed && "justify-center px-0",
      // Active state is a rule and weight, not a filled pill — the chrome
      // carries no colour of its own (design.md §3.1).
      isActive
        ? "border-l-2 border-ink font-medium text-ink"
        : "border-l-2 border-transparent text-ink-muted hover:text-ink",
    );

  return (
    <aside
      className={cn(
        // A touch deeper than the paper it sits beside, so the rail reads as
        // its own zone without needing a dark ground (design.md §5.1).
        "flex h-full shrink-0 flex-col border-r border-rule bg-sidebar transition-[width] duration-180",
        collapsed ? "w-14" : "w-[236px]",
      )}
    >
      {/* Brand row */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-rule",
          collapsed ? "justify-center px-0" : "gap-2 px-4",
        )}
      >
        {/* Wordmark set in the document voice — no logo tile, no gradient. */}
        {collapsed ? (
          <span className="font-serif text-lg text-ink">T</span>
        ) : (
          <>
            <span className="font-serif text-[19px] tracking-tight text-ink">
              Trellis
            </span>
            <button
              title="Collapse sidebar"
              onClick={onToggle}
              className="ml-auto flex h-6 w-6 items-center justify-center text-ink-faint hover:text-ink"
            >
              <PanelLeftClose size={14} />
            </button>
          </>
        )}
      </div>
      {collapsed && (
        <button
          title="Expand sidebar"
          onClick={onToggle}
          className="mx-auto mt-2 flex h-6 w-6 items-center justify-center text-ink-faint hover:text-ink"
        >
          <PanelLeft size={14} />
        </button>
      )}

      {/* Workspace switcher */}
      <div className={cn("pt-3", collapsed ? "px-2" : "px-3")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title={workspace?.name ?? "Workspaces"}
              className={cn(
                "flex w-full items-center gap-2 text-sm transition-colors",
                collapsed
                  ? "justify-center py-1.5"
                  : "border border-rule bg-frame/60 px-2.5 py-1.5 hover:bg-frame",
              )}
            >
              {workspace ? (
                <Monogram name={workspace.name} />
              ) : (
                <span className="h-4 w-4 bg-neutral-200" />
              )}
              {!collapsed && (
                <>
                  <span className="truncate text-[13.5px] font-medium text-ink">
                    {workspace?.name ?? "No workspace"}
                  </span>
                  <ChevronsUpDown
                    size={13}
                    className="ml-auto shrink-0 text-ink-faint"
                  />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onSelect={() => onSelectWorkspace(w.id)}
              >
                <Monogram name={w.name} size={18} />
                <span className="truncate">{w.name}</span>
                {w.id === workspace?.id && (
                  <Check size={14} className="ml-auto text-brand-600" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setWsDialogOpen(true)}>
              <Plus size={14} className="text-neutral-400" />
              New workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Pinned nav */}
      <nav className={cn("space-y-0.5 pt-4", collapsed ? "px-2" : "px-3")}>
        <NavLink
          to="/"
          end
          title="Home"
          className={({ isActive }) => navItemCls(isActive)}
        >
          <Home size={15} className="shrink-0" />
          {!collapsed && "Home"}
        </NavLink>
        <button
          title="Search (Ctrl+K)"
          onClick={onOpenSearch}
          className={cn(navItemCls(false), "w-full")}
        >
          <Search size={15} className="shrink-0" />
          {!collapsed && "Search"}
        </button>
      </nav>

      {/* Boards in the active workspace */}
      <div
        className={cn(
          "mt-5 flex-1 overflow-y-auto pb-4",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between border-b border-rule px-3 pb-1.5">
            <span className="text-[10.5px] font-semibold tracking-[0.12em] text-ink-faint uppercase">
              Boards
            </span>
            {workspace && (
              <button
                title="New board"
                onClick={() => setAddingBoard(true)}
                className="flex h-5 w-5 items-center justify-center text-ink-faint hover:text-ink"
              >
                <Plus size={13} />
              </button>
            )}
          </div>
        )}
        <div className="space-y-0.5">
          {boardsQuery.isPending && workspace && (
            <>
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </>
          )}
          {boards.map((b) => (
            <NavLink
              key={b.id}
              to={`/boards/${b.id}`}
              title={b.name}
              className={({ isActive }) => navItemCls(isActive)}
            >
              {/* A board is a client engagement — the sidebar is really a
                  client list, so each carries its own identity color. */}
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorForString(b.name) }}
              />
              {!collapsed && <span className="truncate">{b.name}</span>}
            </NavLink>
          ))}
          {!collapsed && addingBoard && (
            <Input
              autoFocus
              className="mt-1 w-full"
              placeholder="Board name"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && boardName.trim()) {
                  createBoard.mutate(boardName.trim(), {
                    onSuccess: () => {
                      setBoardName("");
                      setAddingBoard(false);
                    },
                  });
                }
                if (e.key === "Escape") setAddingBoard(false);
              }}
              onBlur={() => !boardName && setAddingBoard(false)}
            />
          )}
          {!collapsed && workspacesPending && (
            <Skeleton className="h-7 w-full" />
          )}
        </div>
      </div>

      {/* User block */}
      {!collapsed && (
        <div className="border-t border-rule p-3">
          <div className="flex items-center gap-2.5 px-1 py-1">
            <Avatar name={me.user.name} size={28} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium text-ink">
                {me.user.name}
              </div>
              <div className="truncate font-mono text-[11px] text-ink-faint">
                {me.organization?.name}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New workspace dialog */}
      <Dialog open={wsDialogOpen} onOpenChange={setWsDialogOpen}>
        <DialogContent>
          <DialogTitle>New workspace</DialogTitle>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (wsName.trim()) createWs.mutate();
            }}
          >
            <Input
              autoFocus
              placeholder="e.g. Marketing"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createWs.isPending}>
                Create workspace
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
