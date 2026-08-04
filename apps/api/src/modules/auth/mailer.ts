import type { Mail } from "../../lib/mailer.js";

export { sendMail, mailTransport } from "../../lib/mailer.js";

/** Auth's own transactional content, over the shared transport (lib/mailer.ts). */

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
