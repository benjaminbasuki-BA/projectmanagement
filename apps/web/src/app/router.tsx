import { useEffect, useRef, useState, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AuthPage } from "../features/auth/AuthPage";
import { ForgotPasswordPage } from "../features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { HomePage } from "../features/home/HomePage";
import { BoardPage } from "../features/boards/BoardPage";
import { SecurityPage } from "../features/settings/SecurityPage";
import { AppShell } from "./AppShell";
import { useMe } from "../lib/queries";
import * as api from "../lib/api-client";
import { Spinner } from "@trellis/ui";

/**
 * Route tree, minimal walking-skeleton subset of doc 06 §3. Paths are
 * simplified (no /w/{workspaceSlug} prefix yet) — the full route shape
 * lands with the real app shell/sidebar.
 */

// Dev-only: auto-provisions/logs-in a fixed local account so the auth
// screens can be worked on separately without blocking every other page.
// import.meta.env.DEV is false in production builds, so this never ships.
const DEV_AUTH_BYPASS = import.meta.env.DEV;
const DEV_USER = {
  email: "dev@trellis.local",
  password: "dev-local-password",
  name: "Dev User",
};

// Matches the org the seed script creates (apps/api/src/dev/seed.mjs), so a
// browser that gets there first doesn't end up with a second, empty org.
const DEV_ORG = { name: "BYU-Hawaii", slug: "byu-hawaii" };

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}

/**
 * Set when the user signs out deliberately, so the dev bypass doesn't
 * immediately sign them back in — otherwise the sign-out flow can't be
 * tested at all in dev. Cleared on a real sign-in or a page reload.
 */
const SIGNED_OUT_KEY = "trellis.dev.signedOut";

export function markDevSignOut() {
  if (DEV_AUTH_BYPASS) sessionStorage.setItem(SIGNED_OUT_KEY, "1");
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe();
  const queryClient = useQueryClient();
  const attempted = useRef(false);
  const orgAttempted = useRef(false);
  const [bypassFailed, setBypassFailed] = useState<string | null>(null);
  // Set once the dev org attach has finished, successfully or not, so a
  // failure falls through to the real screen instead of looping a spinner.
  const [orgAttachSettled, setOrgAttachSettled] = useState(false);

  const deliberatelySignedOut =
    DEV_AUTH_BYPASS && sessionStorage.getItem(SIGNED_OUT_KEY) === "1";

  useEffect(() => {
    if (me) attempted.current = false;
  }, [me]);

  useEffect(() => {
    if (deliberatelySignedOut) return;
    if (!DEV_AUTH_BYPASS || isPending || me || attempted.current) return;
    attempted.current = true;
    (async () => {
      try {
        await api.login(DEV_USER);
      } catch {
        try {
          await api.signup(DEV_USER);
        } catch (err) {
          setBypassFailed(
            err instanceof Error ? err.message : "Auto-login failed",
          );
          return;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    })();
  }, [isPending, me, queryClient, deliberatelySignedOut]);

  // Dev-only: skip the "Name your organization" step. A signed-in dev
  // account with no org otherwise dead-ends on that screen every time the
  // in-memory database resets, which is several times an hour.
  useEffect(() => {
    if (!DEV_AUTH_BYPASS || deliberatelySignedOut) return;
    if (!me || me.activeOrgId || orgAttempted.current) return;
    orgAttempted.current = true;
    (async () => {
      try {
        await api.createOrganization(DEV_ORG);
        await queryClient.invalidateQueries({ queryKey: ["me"] });
      } catch {
        // Most likely the slug already exists (the seed script got there
        // first) but this session isn't attached to it. Nothing further to
        // try — there's no "list my organizations" endpoint yet — so fall
        // through to the real create-org screen rather than looping.
        console.info(
          "[dev] Couldn't auto-attach an organization. Run the seed script: " +
            "cd apps/api && node src/dev/seed.mjs",
        );
      } finally {
        setOrgAttachSettled(true);
      }
    })();
  }, [me, queryClient, deliberatelySignedOut]);

  if (DEV_AUTH_BYPASS && !bypassFailed && !deliberatelySignedOut) {
    if (!me) return <FullScreenLoader />;
    // Hold the loader while the org is being attached so the create-org
    // screen doesn't flash on every reset.
    if (!me.activeOrgId && !orgAttachSettled) return <FullScreenLoader />;
    return children;
  }

  if (isPending) return <FullScreenLoader />;
  if (!me) return <Navigate to="/login" replace />;
  return children;
}

/**
 * Signed-in users have no business on the sign-in screens — bounce them
 * home rather than showing a form that would just re-authenticate them.
 */
function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe();
  if (isPending) return <FullScreenLoader />;
  if (me) return <Navigate to="/" replace />;
  return children;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <RedirectIfAuthed>
        <AuthPage mode="login" />
      </RedirectIfAuthed>
    ),
  },
  {
    path: "/signup",
    element: (
      <RedirectIfAuthed>
        <AuthPage mode="signup" />
      </RedirectIfAuthed>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <RedirectIfAuthed>
        <ForgotPasswordPage />
      </RedirectIfAuthed>
    ),
  },
  // Reachable while signed in: the emailed link should work even if the
  // browser still holds a session for the account being recovered.
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/boards/:boardId", element: <BoardPage /> },
      { path: "/settings/security", element: <SecurityPage /> },
    ],
  },
]);
