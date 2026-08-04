import { useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  Inbox,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
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
  EmptyState,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@trellis/ui";
import * as api from "../lib/api-client";
import type { Me, Workspace } from "../lib/api-client";
import { useGroups } from "../lib/queries";
import { useCreateBoard } from "../features/boards/useCreateBoard";
import { markDevSignOut } from "./router";

const SEARCH_KBD = /mac/i.test(navigator.platform) ? "⌘K" : "Ctrl K";

/**
 * Top navigation bar (doc 11 §B.1): ⌘K search affordance, quick-create,
 * notification bell (placeholder inbox until the notifications API
 * lands, doc 08 sprints 5–6), and the profile menu.
 */
export function TopBar({
  me,
  workspace,
  onOpenSearch,
}: {
  me: Me;
  workspace: Workspace | undefined;
  onOpenSearch: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Quick-create needs board context when the user is on a board page.
  const boardMatch = useMatch("/boards/:boardId");
  const boardId = boardMatch?.params.boardId;
  const groupsQuery = useGroups(boardId);
  const firstGroup = groupsQuery.data?.groups[0];

  const newItem = useMutation({
    mutationFn: () =>
      api.createItem(boardId!, { name: "New item", groupId: firstGroup!.id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["items", boardId] }),
  });

  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [boardName, setBoardName] = useState("");
  const createBoard = useCreateBoard(workspace?.id);

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      // Tell the dev auto-login to stand down, otherwise it signs straight
      // back in and sign-out can't be tested locally.
      markDevSignOut();
      queryClient.setQueryData(["me"], null);
      queryClient.clear();
      navigate("/login");
    },
  });

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-paper px-6">
      <button
        onClick={onOpenSearch}
        className="flex h-8 w-72 items-center gap-2 border border-rule px-2.5 text-[13px] text-ink-muted transition-colors hover:border-ink-faint"
      >
        <Search size={14} />
        Search
        <kbd className="ml-auto font-mono text-[11px] text-ink-faint">
          {SEARCH_KBD}
        </kbd>
      </button>

      <div className="flex-1" />

      {/* Quick create */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus size={14} />
            New
            <ChevronDown size={13} className="-mr-0.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {boardId && firstGroup && (
            <DropdownMenuItem onSelect={() => newItem.mutate()}>
              Item
              <span className="ml-auto text-xs text-neutral-400">
                this board
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={!workspace}
            onSelect={() => setBoardDialogOpen(true)}
          >
            Board…
            {workspace && (
              <span className="ml-auto truncate text-xs text-neutral-400">
                {workspace.name}
              </span>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Notifications */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            title="Notifications"
            className="flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:text-ink"
          >
            <Bell size={16} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-neutral-100 px-4 py-3 text-sm font-medium text-neutral-800">
            Notifications
          </div>
          <EmptyState
            icon={<Inbox size={18} />}
            title="You're all caught up"
            body="Mentions and updates on your items will land here."
          />
        </PopoverContent>
      </Popover>

      {/* Profile menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            title={me.user.name}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <Avatar name={me.user.name} size={28} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="text-sm font-medium text-neutral-800">
              {me.user.name}
            </div>
            <div className="truncate text-xs font-normal text-neutral-400">
              {me.user.email}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate("/settings/security")}>
            <ShieldCheck size={14} className="text-neutral-400" />
            Security
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logout.mutate()}>
            <LogOut size={14} className="text-neutral-400" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* New board dialog */}
      <Dialog open={boardDialogOpen} onOpenChange={setBoardDialogOpen}>
        <DialogContent>
          <DialogTitle>New board</DialogTitle>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!boardName.trim()) return;
              createBoard.mutate(boardName.trim(), {
                onSuccess: () => {
                  setBoardName("");
                  setBoardDialogOpen(false);
                },
              });
            }}
          >
            <Input
              autoFocus
              placeholder="Board name"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBoardDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createBoard.isPending}>
                Create board
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}
