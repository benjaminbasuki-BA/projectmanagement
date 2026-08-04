import { and, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { users, sessions, passwordResetTokens } from "../../db/schema/index.js";
import { env } from "../../config/env.js";
import { hashPassword } from "./password.js";
import { generateToken, hashToken } from "./tokens.js";
import { sendMail, passwordResetMail, passwordChangedMail } from "./mailer.js";
import { validationError } from "./http.js";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour (docs/10 §1)

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10).max(256),
});

/**
 * Password reset (docs/04-api-design.md §2.1, docs/10 §1).
 *
 * Two deliberate properties:
 *  - **Never reveals whether an email is registered.** Both the request and
 *    any failure return the same 202, so this endpoint can't be used to
 *    enumerate accounts.
 *  - **Completing a reset revokes every other session**, so a stolen
 *    password can't outlive the recovery that was meant to stop it.
 */
export const passwordResetRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/auth/password/forgot",
    // This endpoint always answers 202, so it can't be used to brute-force
    // credentials — but it does send an email per call, so it's still an
    // abuse vector (mail-bombing a victim's inbox) without a cap.
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = forgotSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const [user] = await app.db
        .select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(eq(users.email, parsed.data.email))
        .limit(1);

      // An OAuth-only account has no password to reset. Still answer 202 —
      // saying "that account uses Google" would confirm the address exists.
      if (user && !user.deletedAt && user.passwordHash) {
        const token = generateToken();

        // Invalidate any outstanding links first, so requesting a second
        // email doesn't leave the first one live.
        await app.db
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(passwordResetTokens.userId, user.id),
              isNull(passwordResetTokens.usedAt),
            ),
          );

        await app.db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
          requestedIp: request.ip,
        });

        const resetUrl = `${env.APP_BASE_URL}/reset-password?token=${token}`;
        try {
          await sendMail(passwordResetMail(user.email, resetUrl));
        } catch (err) {
          // Don't fail the request on a mail outage — the caller must not be
          // able to distinguish "sent" from "not sent" anyway.
          request.log.error({ err }, "password reset mail failed to send");
        }
      }

      return reply.code(202).send({
        message:
          "If an account exists for that email, a reset link is on its way.",
      });
    },
  );

  app.post(
    "/auth/password/reset",
    // The token itself is a 256-bit secret, but this still caps how many
    // guesses an attacker gets against a token they've partially observed
    // (e.g. from a referrer leak) before it expires.
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = resetSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const [row] = await app.db
        .select({
          id: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
          expiresAt: passwordResetTokens.expiresAt,
          usedAt: passwordResetTokens.usedAt,
          email: users.email,
          userDeletedAt: users.deletedAt,
        })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(eq(passwordResetTokens.tokenHash, hashToken(parsed.data.token)))
        .limit(1);

      if (
        !row ||
        row.usedAt ||
        row.userDeletedAt ||
        row.expiresAt.getTime() < Date.now()
      ) {
        return reply.code(400).send({
          type: "https://docs.trellis.app/errors/invalid-token",
          title: "Invalid or expired reset link",
          status: 400,
          detail: "Request a new password reset link and try again.",
        });
      }

      const passwordHash = await hashPassword(parsed.data.password);

      await app.db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, row.userId));

      await app.db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, row.id));

      // Recovery is only meaningful if it also evicts whoever might already
      // be in the account (docs/10 §1).
      await app.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)),
        );

      try {
        await sendMail(passwordChangedMail(row.email));
      } catch (err) {
        request.log.error({ err }, "password changed notice failed to send");
      }

      return reply.code(204).send();
    },
  );
};
