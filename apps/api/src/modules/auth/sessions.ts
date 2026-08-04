import { randomBytes, createHash } from "node:crypto";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { FastifyReply } from "fastify";
// Side-effect import: augments FastifyReply with setCookie/clearCookie.
import "@fastify/cookie";
import { sessions, users, orgMemberships } from "../../db/schema/index.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { env } from "../../config/env.js";
import type { AppDb } from "../../db/types.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day rolling expiry (03 §3)
const LAST_SEEN_THROTTLE_MS = 60 * 1000; // avoid a write on every request

/** Opaque 256-bit token (03 §3) — the cookie holds this, never the hash. */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export interface CreateSessionInput {
  userId: string;
  ip?: string;
  userAgent?: string;
}

/** Creates a session row and returns the raw token (never stored). */
export async function createSession(
  db: AppDb,
  input: CreateSessionInput,
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const [row] = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      tokenHash: hashToken(token),
      ip: input.ip,
      userAgent: input.userAgent,
      expiresAt,
    })
    .returning({ id: sessions.id });

  return { token, sessionId: row.id, expiresAt };
}

export interface AuthenticatedSession {
  sessionId: string;
  activeOrgId: string | null;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Validates a raw cookie token and returns the session + user, or null.
 * Also opportunistically bumps last_seen_at (throttled).
 */
export async function validateSessionToken(
  db: AppDb,
  token: string,
): Promise<AuthenticatedSession | null> {
  const tokenHash = hashToken(token);

  const [row] = await db
    .select({
      sessionId: sessions.id,
      activeOrgId: sessions.activeOrgId,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      userDeletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  if (row.userDeletedAt) return null;

  const staleFor = Date.now() - row.lastSeenAt.getTime();
  if (staleFor > LAST_SEEN_THROTTLE_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, row.sessionId));
  }

  return {
    sessionId: row.sessionId,
    activeOrgId: row.activeOrgId,
    user: { id: row.userId, email: row.email, name: row.name },
  };
}

export async function revokeSession(
  db: AppDb,
  sessionId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function setActiveOrg(
  db: AppDb,
  sessionId: string,
  orgId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ activeOrgId: orgId })
    .where(eq(sessions.id, sessionId));
}

/**
 * Adopts the org this user last had active, so signing in doesn't strand a
 * returning member on the create-org screen.
 *
 * The `sessions` read is auth infrastructure (not org-scoped), so it's
 * allowed before a tenant context exists; membership is then re-verified
 * through the normal tenant-scoped path before the org is adopted — the
 * same check as POST /organizations/:id/select.
 *
 * Shared by every path that mints a session: password login, 2FA challenge
 * exchange, and the Google OAuth callback.
 */
export async function resumeLastActiveOrg(
  db: AppDb,
  userId: string,
  sessionId: string,
): Promise<void> {
  const [lastOrgSession] = await db
    .select({ activeOrgId: sessions.activeOrgId })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNotNull(sessions.activeOrgId)))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(1);

  const candidateOrgId = lastOrgSession?.activeOrgId;
  if (!candidateOrgId) return;

  const [membership] = await withTenantContext(db, candidateOrgId, (tx) =>
    tx
      .select({ role: orgMemberships.role })
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.orgId, candidateOrgId),
          eq(orgMemberships.userId, userId),
        ),
      )
      .limit(1),
  );

  if (membership) {
    await setActiveOrg(db, sessionId, candidateOrgId);
  }
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
};

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(env.SESSION_COOKIE_NAME, token, COOKIE_OPTIONS);
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
}
