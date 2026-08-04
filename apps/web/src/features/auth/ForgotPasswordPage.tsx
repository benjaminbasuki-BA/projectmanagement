import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Loader2, MailCheck } from "lucide-react";
import { Button, Input } from "@trellis/ui";
import * as api from "../../lib/api-client";
import { errorMessage } from "../../lib/errors";
import { AuthLayout } from "./AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");

  const submit = useMutation({
    mutationFn: () => api.forgotPassword(email),
  });

  // The API answers identically whether or not the address is registered,
  // so the UI must not imply an account was found either.
  if (submit.isSuccess) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={
          <>
            If an account exists for <strong className="text-ink">{email}</strong>,
            a reset link is on its way. It expires in an hour.
          </>
        }
        footer={
          <Link
            to="/login"
            className="font-medium text-deep underline underline-offset-2 hover:text-ink"
          >
            Back to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3 border border-rule bg-paper p-4">
          <MailCheck size={18} className="mt-0.5 shrink-0 text-success" />
          <p className="text-sm text-ink-muted">
            Didn't get it? Check your spam folder, or{" "}
            <button
              type="button"
              onClick={() => submit.reset()}
              className="font-medium text-deep underline underline-offset-2 hover:text-ink"
            >
              try a different email address
            </button>
            .
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Link to="/login" className="font-medium text-deep underline underline-offset-2 hover:text-ink">
          Back to sign in
        </Link>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) submit.mutate();
        }}
      >
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-[13px] font-medium text-ink"
          >
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoFocus
            className="h-11"
            autoComplete="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {submit.error && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(submit.error)}
          </p>
        )}

        <Button
          type="submit"
          disabled={submit.isPending || !email.trim()}
          className="h-11 w-full text-[15px]"
        >
          {submit.isPending && (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          )}
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
