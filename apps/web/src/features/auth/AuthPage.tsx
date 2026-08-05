import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button, Input, cn } from "@trellis/ui";
import * as api from "../../lib/api-client";
import { errorMessage } from "../../lib/errors";
import { AuthLayout } from "./AuthLayout";
import { GoogleButton } from "./GoogleButton";
import { TwoFactorChallenge } from "./TwoFactorChallenge";

const PASSWORD_MIN = 10;

/** Maps the OAuth callback's ?error= codes to something a person can act on. */
const OAUTH_ERRORS: Record<string, string> = {
  bad_state:
    "That sign-in attempt couldn't be verified. Please try signing in again.",
  missing_code: "Google didn't complete the sign-in. Please try again.",
  token_exchange_failed:
    "We couldn't reach Google just then. Please try again.",
  userinfo_failed: "We couldn't read your Google profile. Please try again.",
  email_unverified:
    "That Google account's email isn't verified, so we can't use it to sign in.",
  account_unavailable: "That account is no longer available.",
  access_denied: "Sign-in with Google was cancelled.",
};

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);

  const config = useQuery({
    queryKey: ["auth-config"],
    queryFn: api.authConfig,
    staleTime: 5 * 60_000,
  });

  const oauthError = searchParams.get("error");
  const minLength = config.data?.passwordMinLength ?? PASSWORD_MIN;
  const passwordTooShort =
    mode === "signup" && password.length > 0 && password.length < minLength;

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === "signup") {
        return api.signup({ email, password, name });
      }
      return api.login({ email, password });
    },
    onSuccess: async (result) => {
      // Login may hand back a second-factor challenge rather than a session.
      if (result && "twoFactorRequired" in result && result.twoFactorRequired) {
        setChallenge(result.challenge);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/");
    },
  });

  if (challenge) {
    return (
      <TwoFactorChallenge
        challenge={challenge}
        onCancel={() => setChallenge(null)}
      />
    );
  }

  const isSignup = mode === "signup";
  const canSubmit =
    email.trim() !== "" &&
    password !== "" &&
    (!isSignup || (name.trim() !== "" && password.length >= minLength));

  return (
    <AuthLayout
      title={isSignup ? "Create your account" : "Welcome back"}
      subtitle={
        isSignup
          ? "Free while we're in beta — no card, no seat limits."
          : "Sign in to pick up where you left off."
      }
      footer={
        isSignup ? (
          <>
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-deep underline underline-offset-2 hover:text-ink"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Trellis?{" "}
            <Link
              to="/signup"
              className="font-medium text-deep underline underline-offset-2 hover:text-ink"
            >
              Create an account
            </Link>
          </>
        )
      }
    >
      {oauthError && (
        <div
          role="alert"
          className="mb-5 border-l-2 border-alert bg-alert/5 px-3.5 py-3 text-sm text-danger"
        >
          {OAUTH_ERRORS[oauthError] ?? "Sign-in failed. Please try again."}
        </div>
      )}

      {/* Only rendered when the server says Google is actually configured. */}
      {config.data?.providers.google && (
        <>
          <GoogleButton mode={mode} />
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-rule" />
            <span className="text-xs text-ink-muted">or</span>
            <span className="h-px flex-1 bg-rule" />
          </div>
        </>
      )}

      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (canSubmit) submit.mutate();
        }}
      >
        {isSignup && (
          <Field label="Your name" htmlFor="name">
            <Input
              id="name"
              className="h-11"
              autoComplete="name"
              placeholder="Priya Raman"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            className="h-11"
            autoComplete="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={isSignup ? `At least ${minLength} characters` : undefined}
          error={
            touched && passwordTooShort
              ? `Use at least ${minLength} characters.`
              : undefined
          }
          action={
            !isSignup ? (
              <Link
                to="/forgot-password"
                className="text-[13px] font-medium text-deep underline underline-offset-2 hover:text-ink"
              >
                Forgot password?
              </Link>
            ) : undefined
          }
        >
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              className={cn(
                "h-11 pr-11",
                touched && passwordTooShort && "border-danger",
              )}
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "Create a password" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        {submit.error && (
          <p role="alert" className="text-sm text-danger">
            {mode === "login" && (submit.error as api.ApiError)?.status === 401
              ? "That email and password don't match. Check them and try again."
              : errorMessage(submit.error)}
          </p>
        )}

        <Button
          type="submit"
          disabled={submit.isPending}
          className="h-11 w-full text-[15px]"
        >
          {submit.isPending && (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          )}
          {isSignup ? "Create account" : "Sign in"}
        </Button>
      </form>

      {isSignup && (
        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          By creating an account you agree to keep client data you upload within
          your organisation's own policies.
        </p>
      )}
    </AuthLayout>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  action,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
