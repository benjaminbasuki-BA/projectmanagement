import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, UserMinus } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  PageLoader,
} from "@trellis/ui";
import * as api from "../../lib/api-client";
import type { OrgMember } from "../../lib/api-client";
import { useMe, useOrg, useOrgMembers, useWorkspaces } from "../../lib/queries";
import { errorMessage } from "../../lib/errors";
import { SettingsNav } from "./SettingsNav";

/**
 * docs/01 §2.8 admin console: account name, workspace management, and
 * the member list (invite/role/deactivate). Mutations that need admin
 * are still submitted by anyone — the API is the real gate (403) — but
 * the controls are hidden for non-admins so the page doesn't dangle
 * actions that will just fail.
 */
export function OrganizationPage() {
  const { data: me } = useMe();
  const { data: org } = useOrg();

  if (!me || !org) return <PageLoader />;
  const isAdmin = org.role === "admin";

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <SettingsNav />
      <header className="mb-8">
        <h1 className="font-display text-[28px] leading-tight font-semibold text-ink">
          Organization
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Account details, workspaces, and who has access.
        </p>
      </header>

      <OrgNameSection name={org.organization.name} editable={isAdmin} />
      <WorkspacesSection editable={isAdmin} />
      <MembersSection currentUserId={me.user.id} isAdmin={isAdmin} />
    </div>
  );
}

function OrgNameSection({
  name,
  editable,
}: {
  name: string;
  editable: boolean;
}) {
  const [value, setValue] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (input: string) => api.updateOrg({ name: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["org"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setValue(null);
    },
  });

  const editing = value ?? name;

  return (
    <section className="rounded-card border border-rule bg-sheet p-6 shadow-card">
      <h2 className="text-base font-semibold text-ink">Account name</h2>
      {editable ? (
        <form
          className="mt-4 flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editing.trim() && editing !== name) save.mutate(editing.trim());
          }}
        >
          <Input
            className="h-10 max-w-sm"
            value={editing}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button
            type="submit"
            disabled={save.isPending || !editing.trim() || editing === name}
          >
            {save.isPending && (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            )}
            Save
          </Button>
        </form>
      ) : (
        <p className="mt-2 text-sm text-ink">{name}</p>
      )}
      {save.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorMessage(save.error)}
        </p>
      )}
    </section>
  );
}

function WorkspacesSection({ editable }: { editable: boolean }) {
  const { data } = useWorkspaces();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      api.renameWorkspace(input.id, input.name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setEditingId(null);
    },
  });

  const workspaces = data?.workspaces ?? [];
  if (workspaces.length === 0) return null;

  return (
    <section className="mt-6 rounded-card border border-rule bg-sheet p-6 shadow-card">
      <h2 className="text-base font-semibold text-ink">Workspaces</h2>
      <ul className="mt-4 divide-y divide-rule">
        {workspaces.map((w) => (
          <li key={w.id} className="flex items-center gap-3 py-2.5">
            {editingId === w.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim())
                    rename.mutate({ id: w.id, name: draft.trim() });
                }}
              >
                <Input
                  autoFocus
                  className="h-9 max-w-sm"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button type="submit" size="sm" disabled={rename.isPending}>
                  Save
                </Button>
                <button
                  type="button"
                  className="text-sm text-ink-muted hover:text-ink"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span className="flex-1 text-sm text-ink">{w.name}</span>
                {editable && (
                  <button
                    className="text-sm font-medium text-deep hover:underline"
                    onClick={() => {
                      setEditingId(w.id);
                      setDraft(w.name);
                    }}
                  >
                    Rename
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MembersSection({
  currentUserId,
  isAdmin,
}: {
  currentUserId: string;
  isAdmin: boolean;
}) {
  const { data, isPending } = useOrgMembers();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["org", "members"] });

  const changeRole = useMutation({
    mutationFn: (input: { id: string; role: "admin" | "member" }) =>
      api.updateMemberRole(input.id, input.role),
    onSuccess: invalidate,
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.deactivateMember(id),
    onSuccess: invalidate,
  });

  const members = (data?.members ?? []).filter((m) => !m.deactivatedAt);

  return (
    <section className="mt-6 rounded-card border border-rule bg-sheet p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Members</h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Mail size={14} />
            Invite
          </Button>
        )}
      </div>

      {(changeRole.error || deactivate.error) && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {errorMessage(changeRole.error ?? deactivate.error)}
        </p>
      )}

      {isPending ? (
        <p className="mt-4 text-sm text-ink-muted">Loading…</p>
      ) : (
        <ul className="mt-4 divide-y divide-rule">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isSelf={m.userId === currentUserId}
              isAdmin={isAdmin}
              onChangeRole={(role) => changeRole.mutate({ id: m.id, role })}
              onDeactivate={() => deactivate.mutate(m.id)}
              busy={
                (changeRole.isPending && changeRole.variables?.id === m.id) ||
                (deactivate.isPending && deactivate.variables === m.id)
              }
            />
          ))}
        </ul>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={invalidate}
      />
    </section>
  );
}

function MemberRow({
  member,
  isSelf,
  isAdmin,
  onChangeRole,
  onDeactivate,
  busy,
}: {
  member: OrgMember;
  isSelf: boolean;
  isAdmin: boolean;
  onChangeRole: (role: "admin" | "member") => void;
  onDeactivate: () => void;
  busy: boolean;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">
          {member.name ?? member.email}
          {isSelf && (
            <span className="ml-2 text-xs font-medium text-ink-faint">You</span>
          )}
        </p>
        <p className="truncate text-xs text-ink-faint">{member.email}</p>
      </div>
      {member.invitePending && <Badge>Invite pending</Badge>}
      {isAdmin ? (
        <select
          value={member.role}
          disabled={busy || member.invitePending}
          onChange={(e) => onChangeRole(e.target.value as "admin" | "member")}
          className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm disabled:opacity-50"
        >
          <option value="admin">Admin</option>
          <option value="member">Member</option>
        </select>
      ) : (
        <span className="text-sm text-ink-muted capitalize">{member.role}</span>
      )}
      {isAdmin && !isSelf && (
        <button
          title="Deactivate"
          disabled={busy}
          onClick={onDeactivate}
          className="text-ink-faint hover:text-danger disabled:opacity-50"
        >
          <UserMinus size={16} />
        </button>
      )}
    </li>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");

  const invite = useMutation({
    mutationFn: () => api.inviteMember({ email: email.trim(), role }),
    onSuccess: () => {
      onInvited();
      onOpenChange(false);
      setEmail("");
      setRole("member");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) invite.reset();
      }}
    >
      <DialogContent>
        <DialogTitle>Invite a member</DialogTitle>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) invite.mutate();
          }}
        >
          <Input
            autoFocus
            type="email"
            placeholder="teammate@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "member")}
            className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          {invite.error && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(invite.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={invite.isPending}>
              {invite.isPending && (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              )}
              Send invite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
