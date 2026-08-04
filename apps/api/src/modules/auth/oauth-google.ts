import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { users } from "../../db/schema/index.js";
import { env, googleOAuthConfigured } from "../../config/env.js";
import { generateToken } from "./tokens.js";
import {
  createSession,
  setSessionCookie,
  resumeLastActiveOrg,
} from "./sessions.js";
import { problem } from "./http.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

const STATE_COOKIE = "trellis_oauth_state";
const STATE_TTL_S = 10 * 60;

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/**
 * Google sign-in (docs/01 §2.1 MVP auth).
 *
 * Authorization-code flow. The ID token is not verified locally — instead
 * the access token is exchanged at Google's userinfo endpoint over TLS, so
 * the identity comes straight from Google rather than from a JWT this
 * server would have to validate against JWKS. Fewer moving parts, same
 * trust root.
 *
 * CSRF is handled with the standard `state` parameter, held in a
 * short-lived httpOnly cookie and compared on return.
 */
export const googleOAuthRoutes: FastifyPluginAsync = async (app) => {
  // Routes are only registered when credentials exist, so an unconfigured
  // deployment 404s here rather than failing confusingly mid-flow. The web
  // app learns the same fact from GET /auth/config and hides the button.
  if (!googleOAuthConfigured) {
    app.log.info(
      "Google OAuth not configured (GOOGLE_CLIENT_ID/SECRET unset) — " +
        "sign-in-with-Google routes are not registered.",
    );
    return;
  }

  app.get("/auth/oauth/google/start", async (_request, reply) => {
    const state = generateToken(16);
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_S,
    });

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    return reply.redirect(`${AUTH_ENDPOINT}?${params}`);
  });

  app.get("/auth/oauth/google/callback", async (request, reply) => {
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };
    const cookieState = request.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: "/" });

    const fail = (reason: string) =>
      reply.redirect(
        `${env.APP_BASE_URL}/login?error=${encodeURIComponent(reason)}`,
      );

    if (query.error) return fail(query.error);
    if (!query.code || !query.state) return fail("missing_code");
    if (!cookieState || cookieState !== query.state) return fail("bad_state");

    // Exchange the code for tokens.
    let accessToken: string;
    try {
      const res = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: query.code,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      if (!res.ok) {
        request.log.error(
          { status: res.status, body: await res.text() },
          "google token exchange failed",
        );
        return fail("token_exchange_failed");
      }
      accessToken = ((await res.json()) as { access_token: string })
        .access_token;
    } catch (err) {
      request.log.error({ err }, "google token exchange threw");
      return fail("token_exchange_failed");
    }

    let profile: GoogleUserInfo;
    try {
      const res = await fetch(USERINFO_ENDPOINT, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return fail("userinfo_failed");
      profile = (await res.json()) as GoogleUserInfo;
    } catch (err) {
      request.log.error({ err }, "google userinfo threw");
      return fail("userinfo_failed");
    }

    if (!profile.sub) return fail("userinfo_failed");
    // An unverified Google address must never be allowed to claim an
    // existing Trellis account by email match.
    if (!profile.email || profile.email_verified === false) {
      return fail("email_unverified");
    }

    const userId = await linkOrCreateUser(app.db, profile);
    if (!userId) return fail("account_unavailable");

    const { token, sessionId } = await createSession(app.db, {
      userId,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    await resumeLastActiveOrg(app.db, userId, sessionId);
    setSessionCookie(reply, token);

    return reply.redirect(env.APP_BASE_URL);
  });

  // Present so a misconfigured client gets a clear answer rather than a
  // silent 404 on the POST-style path some SDKs assume.
  app.post("/auth/oauth/google/callback", async (_request, reply) =>
    problem(
      reply,
      405,
      "method-not-allowed",
      "Use GET for the OAuth callback",
    ),
  );
};

/**
 * Resolves a Google profile to a Trellis user:
 *  1. Existing `google_sub` → that user.
 *  2. Existing account with the same verified email → link the sub to it,
 *     so someone who signed up with a password can later use Google
 *     without ending up with two accounts.
 *  3. Otherwise create a passwordless account.
 */
async function linkOrCreateUser(
  db: Parameters<typeof createSession>[0],
  profile: GoogleUserInfo,
): Promise<string | null> {
  const [bySub] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.googleSub, profile.sub))
    .limit(1);
  if (bySub) return bySub.deletedAt ? null : bySub.id;

  const [byEmail] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, profile.email!))
    .limit(1);

  if (byEmail) {
    if (byEmail.deletedAt) return null;
    await db
      .update(users)
      .set({ googleSub: profile.sub, emailVerifiedAt: new Date() })
      .where(eq(users.id, byEmail.id));
    return byEmail.id;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: profile.email!,
      name: profile.name?.trim() || profile.email!.split("@")[0],
      googleSub: profile.sub,
      emailVerifiedAt: new Date(),
      // No passwordHash — this account signs in with Google until the user
      // sets a password via the reset flow.
    })
    .returning({ id: users.id });
  return created.id;
}
