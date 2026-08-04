import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Loader2,
  ShieldCheck,
  ShieldOff,
  TriangleAlert,
} from "lucide-react";
import { Button, Input, PageLoader } from "@trellis/ui";
import * as api from "../../lib/api-client";
import { useMe } from "../../lib/queries";
import { errorMessage } from "../../lib/errors";

/**
 * Account security. 2FA enrollment is three steps on purpose — scan,
 * confirm a live code, then save recovery codes — so a mis-scanned QR can
 * never lock someone out of their own account.
 */
export function SecurityPage() {
  const { data: me } = useMe();
  if (!me) return <PageLoader />;

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <header className="mb-8">
        <h1 className="font-display text-[28px] leading-tight font-semibold text-ink">
          Security
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          How you sign in to {me.organization?.name ?? "Trellis"}.
        </p>
      </header>

      <section className="rounded-card border border-rule bg-sheet p-6 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink">Sign-in methods</h2>
        </div>
        <dl className="mt-4 divide-y divide-rule text-sm">
          <Row label="Email" value={me.user.email} />
          <Row
            label="Password"
            value={me.hasPassword ? "Set" : "Not set — you sign in with Google"}
          />
          <Row
            label="Google"
            value={me.googleLinked ? "Connected" : "Not connected"}
          />
        </dl>
      </section>

      <TwoFactorSection enabled={me.twoFactorEnabled} hasPassword={me.hasPassword} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

type Stage = "idle" | "scan" | "codes";

function TwoFactorSection({
  enabled,
  hasPassword,
}: {
  enabled: boolean;
  hasPassword: boolean;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>("idle");
  const [setupData, setSetupData] = useState<{
    qrDataUrl: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);

  const startSetup = useMutation({
    mutationFn: api.startTwoFactorSetup,
    onSuccess: (data) => {
      setSetupData(data);
      setStage("scan");
    },
  });

  const enable = useMutation({
    mutationFn: () => api.enableTwoFactor(code),
    onSuccess: async (data) => {
      setRecoveryCodes(data.recoveryCodes);
      setStage("codes");
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const disable = useMutation({
    mutationFn: () => api.disableTwoFactor(disablePassword),
    onSuccess: async () => {
      setDisablePassword("");
      setDisabling(false);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <section className="mt-6 rounded-card border border-rule bg-sheet p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            {enabled ? (
              <ShieldCheck size={18} className="text-success" />
            ) : (
              <ShieldOff size={18} className="text-ink-muted" />
            )}
            Two-step verification
          </h2>
          <p className="mt-1 max-w-md text-sm text-ink-muted">
            {enabled
              ? "On — you'll enter a code from your authenticator app each time you sign in."
              : "Add a second step at sign-in using an authenticator app."}
          </p>
        </div>
        {stage === "idle" && !enabled && (
          <Button
            onClick={() => startSetup.mutate()}
            disabled={startSetup.isPending}
          >
            {startSetup.isPending && (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            )}
            Turn on
          </Button>
        )}
        {enabled && !disabling && (
          <Button variant="outline" onClick={() => setDisabling(true)}>
            Turn off
          </Button>
        )}
      </div>

      {startSetup.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {errorMessage(startSetup.error)}
        </p>
      )}

      {/* Step 1 — scan, then prove the app is producing valid codes. */}
      {stage === "scan" && setupData && (
        <div className="mt-6 border-t border-rule pt-6">
          <ol className="space-y-5">
            <li>
              <p className="text-sm font-medium text-ink">
                1. Scan this with your authenticator app
              </p>
              <div className="mt-3 flex flex-wrap items-start gap-5">
                <img
                  src={setupData.qrDataUrl}
                  alt="QR code for two-step verification setup"
                  className="rounded-lg border border-rule"
                  width={160}
                  height={160}
                />
                <div className="text-sm">
                  <p className="text-ink-muted">
                    Can't scan? Enter this key manually:
                  </p>
                  <code className="mt-1.5 block rounded-md bg-canvas px-2.5 py-2 font-mono text-[13px] break-all text-ink">
                    {setupData.secret}
                  </code>
                </div>
              </div>
            </li>
            <li>
              <label
                htmlFor="totp"
                className="text-sm font-medium text-ink"
              >
                2. Enter the 6-digit code it shows
              </label>
              <div className="mt-2 flex items-center gap-3">
                <Input
                  id="totp"
                  className="h-11 w-40 text-center font-mono text-lg tracking-[0.25em]"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button
                  onClick={() => enable.mutate()}
                  disabled={enable.isPending || code.trim().length < 6}
                  className="h-11"
                >
                  {enable.isPending && (
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                  )}
                  Confirm
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setStage("idle");
                    setCode("");
                  }}
                  className="text-sm text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
              {enable.error && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {(enable.error as api.ApiError)?.status === 400
                    ? "That code didn't match. Check your app and enter the current code."
                    : errorMessage(enable.error)}
                </p>
              )}
            </li>
          </ol>
        </div>
      )}

      {/* Step 2 — recovery codes, shown exactly once. */}
      {stage === "codes" && (
        <div className="mt-6 border-t border-rule pt-6">
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-3.5">
            <TriangleAlert size={17} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-sm text-ink">
              <strong className="font-medium">
                Save these recovery codes now.
              </strong>{" "}
              Each works once if you lose your device. This is the only time
              they're shown.
            </p>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {recoveryCodes.map((c) => (
              <li
                key={c}
                className="rounded-md bg-canvas px-3 py-2 text-center font-mono text-[13px] text-ink"
              >
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(recoveryCodes.join("\n"));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy codes"}
            </Button>
            <Button onClick={() => setStage("idle")}>I've saved them</Button>
          </div>
        </div>
      )}

      {/* Turning it off re-proves identity first. */}
      {disabling && (
        <div className="mt-6 border-t border-rule pt-6">
          <label
            htmlFor="disable-password"
            className="text-sm font-medium text-ink"
          >
            Confirm your password to turn off two-step verification
          </label>
          {!hasPassword && (
            <p className="mt-1.5 text-sm text-ink-muted">
              This account signs in with Google and has no password set — use
              the password reset flow to set one first.
            </p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <Input
              id="disable-password"
              type="password"
              className="h-11 max-w-xs"
              autoComplete="current-password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
            <Button
              variant="danger"
              className="h-11"
              onClick={() => disable.mutate()}
              disabled={disable.isPending || !disablePassword}
            >
              {disable.isPending && (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              )}
              Turn off
            </Button>
            <button
              type="button"
              onClick={() => {
                setDisabling(false);
                setDisablePassword("");
              }}
              className="text-sm text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
          {disable.error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {(disable.error as api.ApiError)?.status === 401
                ? "That password isn't right."
                : errorMessage(disable.error)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
