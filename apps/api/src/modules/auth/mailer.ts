import { ServerClient } from "postmark";
import { env } from "../../config/env.js";

/**
 * Transactional email (doc 03 §2 — Postmark). Two transports:
 *
 *  - **postmark** when POSTMARK_SERVER_TOKEN is set.
 *  - **console** otherwise, which logs the message (including the reset
 *    link) to stdout. This exists so the password-reset flow is genuinely
 *    end-to-end testable in local dev without an API key — the link is
 *    real and works; only the delivery channel differs.
 *
 * `react-email` templating (doc 03 §2) is not wired up yet; these are the
 * two transactional messages auth needs, kept as inline strings until the
 * notifications module brings the template pipeline with it.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

const client = env.POSTMARK_SERVER_TOKEN
  ? new ServerClient(env.POSTMARK_SERVER_TOKEN)
  : null;

export const mailTransport = client ? "postmark" : "console";

export async function sendMail(mail: Mail): Promise<void> {
  if (!client) {
    console.info(
      `\n📧 [dev mail — no POSTMARK_SERVER_TOKEN set]\n` +
        `   To:      ${mail.to}\n` +
        `   Subject: ${mail.subject}\n` +
        `${mail.text.replace(/^/gm, "   ")}\n`,
    );
    return;
  }

  await client.sendEmail({
    From: env.MAIL_FROM,
    To: mail.to,
    Subject: mail.subject,
    TextBody: mail.text,
    MessageStream: "outbound",
  });
}

export function passwordResetMail(to: string, resetUrl: string): Mail {
  return {
    to,
    subject: "Reset your Trellis password",
    text: [
      "Someone asked to reset the password for this Trellis account.",
      "",
      "Reset it here (the link expires in 1 hour and works once):",
      resetUrl,
      "",
      "If this wasn't you, you can ignore this email — your password hasn't changed.",
    ].join("\n"),
  };
}

export function passwordChangedMail(to: string): Mail {
  return {
    to,
    subject: "Your Trellis password was changed",
    text: [
      "Your Trellis password was just changed, and any other signed-in",
      "sessions were signed out.",
      "",
      "If this wasn't you, reset your password immediately.",
    ].join("\n"),
  };
}
