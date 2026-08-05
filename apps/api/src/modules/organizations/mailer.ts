import type { Mail } from "../../lib/mailer.js";

export function inviteMail(
  to: string,
  input: { orgName: string; inviterName: string; acceptUrl: string },
): Mail {
  return {
    to,
    subject: `${input.inviterName} invited you to ${input.orgName} on Trellis`,
    text: [
      `${input.inviterName} invited you to join ${input.orgName} on Trellis.`,
      "",
      "Accept the invite here (expires in 7 days):",
      input.acceptUrl,
    ].join("\n"),
  };
}
