import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Laptop, Loader2, LogOut, Monitor } from "lucide-react";
import { Button, Input, PageLoader } from "@trellis/ui";
import * as api from "../../lib/api-client";
import { useMe, useSessions } from "../../lib/queries";
import { errorMessage } from "../../lib/errors";
import { SettingsNav } from "./SettingsNav";

/** docs/01 §2.8 admin console: profile, session list, data export. */
export function ProfilePage() {
  const { data: me } = useMe();
  const [name, setName] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const saveName = useMutation({
    mutationFn: (value: string) => api.updateProfile({ name: value }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setName(null);
    },
  });

  if (!me) return <PageLoader />;
  const editingName = name ?? me.user.name;

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <SettingsNav />
      <header className="mb-8">
        <h1 className="font-display text-[28px] leading-tight font-semibold text-ink">
          Profile
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your name, active sessions, and a copy of your organization's data.
        </p>
      </header>

      <section className="rounded-card border border-rule bg-sheet p-6 shadow-card">
        <h2 className="text-base font-semibold text-ink">Name</h2>
        <form
          className="mt-4 flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editingName.trim() && editingName !== me.user.name) {
              saveName.mutate(editingName.trim());
            }
          }}
        >
          <div className="flex-1">
            <label htmlFor="profile-name" className="sr-only">
              Name
            </label>
            <Input
              id="profile-name"
              className="h-10 max-w-sm"
              value={editingName}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            disabled={
              saveName.isPending ||
              editingName.trim() === "" ||
              editingName === me.user.name
            }
          >
            {saveName.isPending && (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            )}
            Save
          </Button>
        </form>
        {saveName.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {errorMessage(saveName.error)}
          </p>
        )}
        <p className="mt-4 text-sm text-ink-muted">
          {me.user.email} — email can't be changed yet.
        </p>
      </section>

      <SessionsSection />

      <section className="mt-6 rounded-card border border-rule bg-sheet p-6 shadow-card">
        <h2 className="text-base font-semibold text-ink">Export your data</h2>
        <p className="mt-1 max-w-md text-sm text-ink-muted">
          Download every board you can see as a zip of CSV files — one per
          board.
        </p>
        <a
          href={api.exportAllDataUrl()}
          className="mt-4 inline-flex h-9 items-center gap-2 border border-rule bg-canvas px-3.5 text-sm font-medium text-ink hover:bg-frame"
        >
          <Download size={15} />
          Download export
        </a>
      </section>
    </div>
  );
}

function SessionsSection() {
  const { data, isPending } = useSessions();
  const queryClient = useQueryClient();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const revokeAll = useMutation({
    mutationFn: api.revokeOtherSessions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const revokeOne = useMutation({
    mutationFn: (id: string) => api.revokeSession(id),
    onMutate: (id) => setRevokingId(id),
    onSettled: () => setRevokingId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const sessions = data?.sessions ?? [];
  const others = sessions.filter((s) => !s.isCurrent);

  return (
    <section className="mt-6 rounded-card border border-rule bg-sheet p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">
            Where you're signed in
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Every device with an active session for your account.
          </p>
        </div>
        {others.length > 0 && (
          <Button
            variant="outline"
            onClick={() => revokeAll.mutate()}
            disabled={revokeAll.isPending}
          >
            {revokeAll.isPending && (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            )}
            <LogOut size={14} />
            Sign out everywhere else
          </Button>
        )}
      </div>

      {isPending ? (
        <p className="mt-4 text-sm text-ink-muted">Loading…</p>
      ) : (
        <ul className="mt-4 divide-y divide-rule">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              {s.isCurrent ? (
                <Monitor size={16} className="shrink-0 text-ink-muted" />
              ) : (
                <Laptop size={16} className="shrink-0 text-ink-faint" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  {s.userAgent ?? "Unknown device"}
                  {s.isCurrent && (
                    <span className="ml-2 text-xs font-medium text-success">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-faint">
                  {s.ip ? `${s.ip} — ` : ""}
                  last active {new Date(s.lastSeenAt).toLocaleString()}
                </p>
              </div>
              {!s.isCurrent && (
                <button
                  onClick={() => revokeOne.mutate(s.id)}
                  disabled={revokingId === s.id}
                  className="text-sm font-medium text-danger hover:underline disabled:opacity-50"
                >
                  {revokingId === s.id ? "Signing out…" : "Sign out"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
