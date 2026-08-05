import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button, PageLoader } from "@trellis/ui";
import * as api from "../../lib/api-client";
import { useMe } from "../../lib/queries";
import { errorMessage } from "../../lib/errors";
import { AuthLayout } from "./AuthLayout";

/**
 * Stashed across the redirect to /login or /signup when the invitee has
 * no session yet — router.tsx's RequireAuth consumes it the moment `me`
 * resolves, so acceptance happens automatically right after auth
 * completes instead of needing a second click back on this page.
 */
const PENDING_INVITE_KEY = "trellis.pendingInvite";

export function stashPendingInvite(orgId: string, token: string) {
  sessionStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ orgId, token }));
}

export function takePendingInvite(): { orgId: string; token: string } | null {
  const raw = sessionStorage.getItem(PENDING_INVITE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_INVITE_KEY);
  try {
    return JSON.parse(raw) as { orgId: string; token: string };
  } catch {
    return null;
  }
}

export function InvitePage() {
  const { orgId, token } = useParams<{ orgId: string; token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me, isPending: mePending } = useMe();

  const preview = useQuery({
    queryKey: ["invite-preview", orgId, token],
    queryFn: () => api.previewInvite(orgId!, token!),
    enabled: !!orgId && !!token,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(orgId!, token!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/");
    },
  });

  if (preview.isPending || mePending) {
    return <PageLoader />;
  }

  if (preview.isError) {
    return (
      <AuthLayout title="This invite isn't valid">
        <p className="text-sm text-ink-muted">
          The link may have expired, already been used, or been revoked. Ask
          whoever invited you to send a new one.
        </p>
      </AuthLayout>
    );
  }

  const { orgName, email, hasAccount } = preview.data;

  if (me) {
    const sameAccount = me.user.email.toLowerCase() === email.toLowerCase();
    if (!sameAccount) {
      return (
        <AuthLayout title={`Invited to ${orgName}`}>
          <p className="text-sm text-ink-muted">
            This invite was sent to{" "}
            <strong className="text-ink">{email}</strong>, but you're signed in
            as {me.user.email}. Sign out and sign back in with that email to
            accept it.
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={async () => {
              await api.logout();
              stashPendingInvite(orgId!, token!);
              window.location.href = "/login";
            }}
          >
            Sign out
          </Button>
        </AuthLayout>
      );
    }

    return (
      <AuthLayout
        title={`Join ${orgName}`}
        subtitle={`You're signed in as ${me.user.email}.`}
      >
        {accept.error && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {errorMessage(accept.error)}
          </p>
        )}
        <Button
          className="h-11 w-full"
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {accept.isPending && (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          )}
          Accept invite
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={`Join ${orgName}`}
      subtitle={`This invite was sent to ${email}.`}
    >
      <Button
        className="h-11 w-full"
        onClick={() => {
          stashPendingInvite(orgId!, token!);
          navigate(
            `${hasAccount ? "/login" : "/signup"}?email=${encodeURIComponent(email)}`,
          );
        }}
      >
        {hasAccount ? "Log in to accept" : "Create your account to accept"}
      </Button>
    </AuthLayout>
  );
}
