import { ServerClient } from "postmark";
import { env } from "../config/env.js";

/**
 * Transactional email (doc 03 §2 — Postmark). Two transports:
 *
 *  - **postmark** when POSTMARK_SERVER_TOKEN is set.
 *  - **console** otherwise, which logs the message (including any link)
 *    to stdout. This exists so mail-sending flows are genuinely
 *    end-to-end testable in local dev without an API key — the content
 *    is real and correct; only the delivery channel differs.
 *
 * `react-email` templating (doc 03 §2) is not wired up yet — every
 * sender (auth/mailer.ts, notifications/mailer.ts) builds inline-string
 * `Mail` values against this one shared transport.
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
