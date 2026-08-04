import { and, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import {
  users,
  userRecoveryCodes,
  authChallenges,
} from "../../db/schema/index.js";
import { verifyPassword } from "./password.js";
import {
  generateToken,
  hashToken,
  generateRecoveryCode,
  normalizeRecoveryCode,
} from "./tokens.js";
import {
  createSession,
  setSessionCookie,
  resumeLastActiveOrg,
} from "./sessions.js";
import {
  generateSecret,
  otpauthUri,
  encryptSecret,
  decryptSecret,
  verifyTotp,
} from "./totp.js";
import { validationError, problem } from "./http.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;

const codeSchema = z.object({ code: z.string().min(6).max(20) });
const passwordSchema = z.object({ password: z.string().min(1) });
const challengeSchema = z.object({
  challenge: z.string().min(1),
  code: z.string().min(6).max(20),
});

/**
 * TOTP two-factor (docs/01 §2.1 "2FA opt-in", docs/10 §1).
 *
 * Enrollment is deliberately two-step: `setup` provisions a secret and
 * returns the QR, but 2FA is not actually on until `enable` proves the
 * user's authenticator produces a valid code. Otherwise a mis-scanned QR
 * would lock the user out of their own account.
 */
export const twoFactorRoutes: FastifyPluginAsync = async (app) => {
  // --- Enrollment (authenticated) ---------------------------------------

  app.post(
    "/auth/2fa/setup",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { user } = request.authSession!;

      const [row] = await app.db
        .select({ totpEnabledAt: users.totpEnabledAt })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (row?.totpEnabledAt) {
        return problem(
          reply,
          409,
          "conflict",
          "Two-factor authentication is already on",
          "Turn it off before setting it up again.",
        );
      }

      const secret = generateSecret();
      // Stored immediately but inert — `totp_enabled_at` stays null until
      // the code below is confirmed.
      await app.db
        .update(users)
        .set({ totpSecretEnc: encryptSecret(secret) })
        .where(eq(users.id, user.id));

      const uri = otpauthUri(user.email, secret);
      return reply.send({
        secret,
        otpauthUri: uri,
        qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }),
      });
    },
  );

  app.post(
    "/auth/2fa/enable",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = codeSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { user } = request.authSession!;
      const [row] = await app.db
        .select({
          totpSecretEnc: users.totpSecretEnc,
          totpEnabledAt: users.totpEnabledAt,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (!row?.totpSecretEnc) {
        return problem(
          reply,
          400,
          "invalid-state",
          "Start setup first",
          "No pending two-factor secret for this account.",
        );
      }
      if (row.totpEnabledAt) {
        return problem(
          reply,
          409,
          "conflict",
          "Two-factor authentication is already on",
        );
      }
      if (!verifyTotp(parsed.data.code, decryptSecret(row.totpSecretEnc))) {
        return problem(
          reply,
          400,
          "invalid-code",
          "That code didn't match",
          "Check your authenticator app and try the current code.",
        );
      }

      // Recovery codes are generated once, shown once, stored hashed.
      const codes = Array.from(
        { length: RECOVERY_CODE_COUNT },
        generateRecoveryCode,
      );
      await app.db
        .delete(userRecoveryCodes)
        .where(eq(userRecoveryCodes.userId, user.id));
      await app.db.insert(userRecoveryCodes).values(
        codes.map((code) => ({
          userId: user.id,
          codeHash: hashToken(normalizeRecoveryCode(code)),
        })),
      );

      await app.db
        .update(users)
        .set({ totpEnabledAt: new Date() })
        .where(eq(users.id, user.id));

      return reply.send({ recoveryCodes: codes });
    },
  );

  app.post(
    "/auth/2fa/disable",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = passwordSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const { user } = request.authSession!;
      const [row] = await app.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      // Turning off a security control requires re-proving identity.
      if (
        !row?.passwordHash ||
        !(await verifyPassword(row.passwordHash, parsed.data.password))
      ) {
        return problem(reply, 401, "unauthenticated", "Incorrect password");
      }

      await app.db
        .update(users)
        .set({ totpSecretEnc: null, totpEnabledAt: null })
        .where(eq(users.id, user.id));
      await app.db
        .delete(userRecoveryCodes)
        .where(eq(userRecoveryCodes.userId, user.id));

      return reply.code(204).send();
    },
  );

  // --- Login challenge (unauthenticated) --------------------------------

  app.post(
    "/auth/2fa/verify",
    // Per-challenge attempts are already capped at MAX_CHALLENGE_ATTEMPTS
    // in the DB; this bounds the other axis — spinning up many challenges
    // (via repeated logins) to get more total guesses from one IP.
    { config: { rateLimit: { max: 20, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const parsed = challengeSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);

      const [row] = await app.db
        .select({
          id: authChallenges.id,
          userId: authChallenges.userId,
          attempts: authChallenges.attempts,
          expiresAt: authChallenges.expiresAt,
          consumedAt: authChallenges.consumedAt,
          totpSecretEnc: users.totpSecretEnc,
          totpEnabledAt: users.totpEnabledAt,
        })
        .from(authChallenges)
        .innerJoin(users, eq(users.id, authChallenges.userId))
        .where(eq(authChallenges.tokenHash, hashToken(parsed.data.challenge)))
        .limit(1);

      const rejected = () =>
        problem(
          reply,
          401,
          "invalid-code",
          "That code didn't match",
          "Enter the current code from your authenticator, or a recovery code.",
        );

      if (
        !row ||
        row.consumedAt ||
        row.expiresAt.getTime() < Date.now() ||
        !row.totpEnabledAt ||
        !row.totpSecretEnc
      ) {
        return problem(
          reply,
          401,
          "invalid-token",
          "This sign-in attempt expired",
          "Start again from the sign-in screen.",
        );
      }

      // Bounded guessing: a 6-digit code is only strong if attempts are few.
      if (row.attempts >= MAX_CHALLENGE_ATTEMPTS) {
        await app.db
          .update(authChallenges)
          .set({ consumedAt: new Date() })
          .where(eq(authChallenges.id, row.id));
        return problem(
          reply,
          429,
          "too-many-attempts",
          "Too many incorrect codes",
          "Start again from the sign-in screen.",
        );
      }

      let ok = verifyTotp(parsed.data.code, decryptSecret(row.totpSecretEnc));
      let usedRecoveryCode = false;

      if (!ok) {
        // Fall back to a recovery code, burning it on success.
        const codeHash = hashToken(normalizeRecoveryCode(parsed.data.code));
        const [recovery] = await app.db
          .select({ id: userRecoveryCodes.id })
          .from(userRecoveryCodes)
          .where(
            and(
              eq(userRecoveryCodes.userId, row.userId),
              eq(userRecoveryCodes.codeHash, codeHash),
              isNull(userRecoveryCodes.usedAt),
            ),
          )
          .limit(1);

        if (recovery) {
          await app.db
            .update(userRecoveryCodes)
            .set({ usedAt: new Date() })
            .where(eq(userRecoveryCodes.id, recovery.id));
          ok = true;
          usedRecoveryCode = true;
        }
      }

      if (!ok) {
        await app.db
          .update(authChallenges)
          .set({ attempts: row.attempts + 1 })
          .where(eq(authChallenges.id, row.id));
        return rejected();
      }

      await app.db
        .update(authChallenges)
        .set({ consumedAt: new Date() })
        .where(eq(authChallenges.id, row.id));

      const { token, sessionId } = await createSession(app.db, {
        userId: row.userId,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
      await resumeLastActiveOrg(app.db, row.userId, sessionId);
      setSessionCookie(reply, token);

      const [user] = await app.db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, row.userId))
        .limit(1);

      const remaining = await app.db
        .select({ id: userRecoveryCodes.id })
        .from(userRecoveryCodes)
        .where(
          and(
            eq(userRecoveryCodes.userId, row.userId),
            isNull(userRecoveryCodes.usedAt),
          ),
        );

      return reply.send({
        user,
        usedRecoveryCode,
        recoveryCodesRemaining: remaining.length,
      });
    },
  );
};

/**
 * Issues the short-lived challenge handed back by login when 2FA is on.
 * Lives here rather than in routes.ts so the whole second-factor lifecycle
 * stays in one file.
 */
export async function createTwoFactorChallenge(
  db: Parameters<typeof createSession>[0],
  userId: string,
): Promise<{ challenge: string; expiresAt: Date }> {
  const challenge = generateToken();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await db.insert(authChallenges).values({
    userId,
    tokenHash: hashToken(challenge),
    expiresAt,
  });
  return { challenge, expiresAt };
}
