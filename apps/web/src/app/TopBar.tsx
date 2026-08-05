import { useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  ChevronDown,
  Inbox,
  LayoutTemplate,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  User,
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
  cn,
} from "@trellis/ui";
import * as api from "../lib/api-client";
import type { Me, Notification, Workspace } from "../lib/api-client";
import {
  useGroups,
  useNotifications,
  useUnreadNotificationCount,
} from "../lib/queries";
import { useCreateBoard } from "../features/boards/useCreateBoard";
import { markDevSignOut } from "./router";

const SEARCH_KBD = /mac/i.test(navigator.platform) ? "⌘K" : "Ctrl K";

function describeNotification(n: Notification): string {
  const who = n.actorName ?? "Someone";
  const itemName =
    typeof n.payload.itemName === "string" ? n.payload.itemName : "an item";
  switch (n.eventType) {
    case "reply":
      return `${who} replied on "${itemName}"`;
    case "reaction":
      return `${who} reacted to your update on "${itemName}"`;
    case "assigned":
      return `${who} assigned you to "${itemName}"`;
    case "status_changed":
      return `${who} changed the status of "${itemName}"`;
    case "mentioned":
      return `${who} mentioned you on "${itemName}"`;
    case "item_created":
      return `${who} created "${itemName}"`;
    case "due_soon":
      return `"${itemName}" is due soon`;
    default:
      return `${who} — ${n.eventType}`;
  }
}

/**
 * Top navigation bar (doc 11 §B.1): ⌘K search affordance, quick-create,
 * notification bell, and the profile menu.
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
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [nameEdited, setNameEdited] = useState(false);
  const createBoard = useCreateBoard(workspace?.id);
  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: api.listTemplates,
    enabled: boardDialogOpen,
  });
  const templates = templatesQuery.data?.templates ?? [];

  const pickTemplate = (id: string | null) => {
    setTemplateId(id);
    // Pre-fill the name from the template, but only until the user
    // actually types their own — don't clobber a name they chose.
    if (!nameEdited) {
      setBoardName(id ? (templates.find((t) => t.id === id)?.name ?? "") : "");
    }
  };

  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: notificationsData } = useNotifications();
  const notifications = notificationsData?.notifications ?? [];

  const invalidateNotifications = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: (ids: string[]) => api.markNotificationsRead(ids),
    onSuccess: invalidateNotifications,
  });
  const markAllRead = useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: invalidateNotifications,
  });

  const openNotification = (n: Notification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.boardId) {
      navigate(
        n.itemId
          ? `/boards/${n.boardId}?item=${n.itemId}`
          : `/boards/${n.boardId}`,
      );
    }
  };

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
            className="relative flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:text-ink"
          >
            <Bell size={16} />
            {!!unreadCount?.count && (
              <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 font-mono text-[9px] text-white">
                {unreadCount.count > 9 ? "9+" : unreadCount.count}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <span className="text-sm font-medium text-neutral-800">
              Notifications
            </span>
            {notifications.some((n) => !n.readAt) && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-neutral-400 hover:text-neutral-600"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <EmptyState
              icon={<Inbox size={18} />}
              title="You're all caught up"
              body="Mentions and updates on your items will land here."
            />
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openNotification(n)}
                    className={`flex w-full flex-col gap-0.5 border-b border-neutral-50 px-4 py-2.5 text-left text-[13px] hover:bg-neutral-50 ${
                      n.readAt ? "text-neutral-500" : "text-neutral-800"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {!n.readAt && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      )}
                      <span>{describeNotification(n)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
          <DropdownMenuItem onSelect={() => navigate("/settings/profile")}>
            <User size={14} className="text-neutral-400" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/settings/security")}>
            <ShieldCheck size={14} className="text-neutral-400" />
            Security
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/settings/organization")}>
            <Building2 size={14} className="text-neutral-400" />
            Organization
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logout.mutate()}>
            <LogOut size={14} className="text-neutral-400" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* New board dialog */}
      <Dialog
        open={boardDialogOpen}
        onOpenChange={(open) => {
          setBoardDialogOpen(open);
          if (!open) {
            setBoardName("");
            setTemplateId(null);
            setNameEdited(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogTitle>New board</DialogTitle>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!boardName.trim()) return;
              createBoard.mutate(
                templateId
                  ? { name: boardName.trim(), templateId }
                  : boardName.trim(),
                { onSuccess: () => setBoardDialogOpen(false) },
              );
            }}
          >
            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => pickTemplate(null)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border p-2.5 text-left",
                  templateId === null
                    ? "border-neutral-900 bg-neutral-50"
                    : "border-neutral-200 hover:border-neutral-300",
                )}
              >
                <Plus size={15} className="text-neutral-400" />
                <span className="text-[13px] font-medium text-neutral-800">
                  Blank board
                </span>
                <span className="text-xs text-neutral-400">
                  Start from scratch
                </span>
              </button>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTemplate(t.id)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-md border p-2.5 text-left",
                    templateId === t.id
                      ? "border-neutral-900 bg-neutral-50"
                      : "border-neutral-200 hover:border-neutral-300",
                  )}
                >
                  <LayoutTemplate size={15} className="text-neutral-400" />
                  <span className="text-[13px] font-medium text-neutral-800">
                    {t.name}
                  </span>
                  <span className="line-clamp-2 text-xs text-neutral-400">
                    {t.description}
                  </span>
                </button>
              ))}
            </div>
            {templateId && (
              <p className="text-xs text-neutral-400">
                {templates.find((t) => t.id === templateId)?.explainer}
              </p>
            )}

            <Input
              autoFocus
              placeholder="Board name"
              value={boardName}
              onChange={(e) => {
                setBoardName(e.target.value);
                setNameEdited(true);
              }}
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
