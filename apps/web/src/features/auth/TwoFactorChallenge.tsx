import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button, Input } from "@trellis/ui";
import * as api from "../../lib/api-client";
import { errorMessage } from "../../lib/errors";
import { AuthLayout } from "./AuthLayout";

/**
 * Second step of sign-in when 2FA is on. The password step returned a
 * short-lived challenge and deliberately *no* session cookie — this screen
 * exchanges it for one (docs/10 §1).
 */
export function TwoFactorChallenge({
  challenge,
  onCancel,
}: {
  challenge: string;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  const verify = useMutation({
    mutationFn: () => api.verifyTwoFactor({ challenge, code }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/");
    },
  });

  // A verify failure can mean "wrong code" (retry here) or "challenge dead"
  // (must restart) — the two need different instructions.
  const err = verify.error as api.ApiError | undefined;
  const challengeDead =
    err?.problem?.type?.includes("invalid-token") ||
    err?.problem?.type?.includes("too-many-attempts");

  return (
    <AuthLayout
      title="Two-step verification"
      subtitle={
        useRecovery
          ? "Enter one of the recovery codes you saved when you turned on two-step verification."
          : "Enter the 6-digit code from your authenticator app."
      }
      footer={
        <button
          type="button"
          onClick={onCancel}
          className="font-medium text-deep underline underline-offset-2 hover:text-ink"
        >
          Back to sign in
        </button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) verify.mutate();
        }}
      >
        <Input
          autoFocus
          className="h-12 text-center font-mono text-lg tracking-[0.3em]"
          inputMode={useRecovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          placeholder={useRecovery ? "XXXX-XXXX" : "000000"}
          maxLength={useRecovery ? 9 : 6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label={useRecovery ? "Recovery code" : "Authentication code"}
        />

        {verify.error && (
          <p role="alert" className="text-sm text-danger">
            {challengeDead
              ? "This sign-in attempt expired. Go back and sign in again."
              : errorMessage(verify.error)}
          </p>
        )}

        <Button
          type="submit"
          disabled={verify.isPending || !code.trim() || challengeDead}
          className="h-11 w-full text-[15px]"
        >
          {verify.isPending && (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          )}
          Verify
        </Button>

        <button
          type="button"
          onClick={() => {
            setUseRecovery((r) => !r);
            setCode("");
          }}
          className="text-[13px] font-medium text-deep underline underline-offset-2 hover:text-ink"
        >
          {useRecovery
            ? "Use your authenticator app instead"
            : "Lost your device? Use a recovery code"}
        </button>
      </form>
    </AuthLayout>
  );
}
