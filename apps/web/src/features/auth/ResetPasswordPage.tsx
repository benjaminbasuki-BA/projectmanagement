import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button, Input, cn } from "@trellis/ui";
import * as api from "../../lib/api-client";
import { errorMessage } from "../../lib/errors";
import { AuthLayout } from "./AuthLayout";

/** Landing page for the emailed link: /reset-password?token=… */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);

  const config = useQuery({
    queryKey: ["auth-config"],
    queryFn: api.authConfig,
    staleTime: 5 * 60_000,
  });
  const minLength = config.data?.passwordMinLength ?? 10;

  const submit = useMutation({
    mutationFn: () => api.resetPassword({ token, password }),
    // Every session was revoked server-side, so send them to sign in fresh.
    onSuccess: () => navigate("/login?reset=1"),
  });

  const tooShort = password.length > 0 && password.length < minLength;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit =
    password.length >= minLength && confirm === password && token !== "";

  if (!token) {
    return (
      <AuthLayout
        title="This link isn't valid"
        subtitle="The reset link is missing its token. Request a new one and try again."
        footer={
          <Link
            to="/forgot-password"
            className="font-medium text-deep underline underline-offset-2 hover:text-ink"
          >
            Request a new link
          </Link>
        }
      >
        <div />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Setting a new password signs you out everywhere else."
      footer={
        <Link
          to="/login"
          className="font-medium text-deep underline underline-offset-2 hover:text-ink"
        >
          Back to sign in
        </Link>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (canSubmit) submit.mutate();
        }}
      >
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[13px] font-medium text-ink"
          >
            New password
          </label>
          <div className="relative">
            <Input
              id="password"
              autoFocus
              type={show ? "text" : "password"}
              className={cn(
                "h-11 pr-11",
                touched && tooShort && "border-danger",
              )}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p
            className={cn(
              "mt-1.5 text-[13px]",
              touched && tooShort ? "text-danger" : "text-ink-muted",
            )}
          >
            At least {minLength} characters
          </p>
        </div>

        <div>
          <label
            htmlFor="confirm"
            className="mb-1.5 block text-[13px] font-medium text-ink"
          >
            Confirm new password
          </label>
          <Input
            id="confirm"
            type={show ? "text" : "password"}
            className={cn("h-11", mismatch && "border-danger")}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && (
            <p className="mt-1.5 text-[13px] text-danger">
              These passwords don't match.
            </p>
          )}
        </div>

        {submit.error && (
          <p role="alert" className="text-sm text-danger">
            {(submit.error as api.ApiError)?.status === 400
              ? "This reset link has expired or was already used. Request a new one."
              : errorMessage(submit.error)}
          </p>
        )}

        <Button
          type="submit"
          disabled={submit.isPending || !canSubmit}
          className="h-11 w-full text-[15px]"
        >
          {submit.isPending && (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          )}
          Set new password
        </Button>
      </form>
    </AuthLayout>
  );
}
