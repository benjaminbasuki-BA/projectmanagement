import type { FastifyInstance } from "fastify";
import { orgMemberships } from "../db/schema/index.js";
import { withTenantContext } from "../db/tenant-db.js";
import type { AppDb } from "../db/types.js";

export function extractCookie(setCookieHeader: string | string[] | undefined) {
  const header = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;
  if (!header) throw new Error("Expected a Set-Cookie header");
  return header.split(";")[0];
}

/** Signs up a fresh user and returns their session cookie. */
export async function signup(app: FastifyInstance, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/signup",
    payload: { email, password: "correct-horse-battery", name: email },
  });
  return extractCookie(res.headers["set-cookie"]);
}

/** Signs up a fresh user without creating an org, returning their id too. */
export async function signupPlain(app: FastifyInstance, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/signup",
    payload: {
      email,
      password: "correct-horse-battery",
      name: email.split("@")[0],
    },
  });
  return {
    cookie: extractCookie(res.headers["set-cookie"]),
    userId: res.json().user.id as string,
  };
}

/**
 * `POST /org/invites` (organizations/routes.ts) now covers this end to
 * end — see organizations/admin.test.ts for tests that actually exercise
 * invite → accept over HTTP. This direct-DB shortcut stays because most
 * *other* tests just need "a second real member of the same org" as
 * setup, not a reason to re-run the invite flow every time.
 */
export async function addOrgMember(db: AppDb, orgId: string, userId: string) {
  await withTenantContext(db, orgId, (tx) =>
    tx.insert(orgMemberships).values({ orgId, userId, role: "member" }),
  );
}

/** signupPlain + addOrgMember + selecting that org as active, in one call. */
export async function addSecondOrgMember(
  app: FastifyInstance,
  db: AppDb,
  orgId: string,
  email: string,
) {
  const b = await signupPlain(app, email);
  await addOrgMember(db, orgId, b.userId);
  await app.inject({
    method: "POST",
    url: `/v1/organizations/${orgId}/select`,
    headers: { cookie: b.cookie },
  });
  return b;
}

/** Signs up a fresh user, creates an org for them, returns the cookie + orgId. */
export async function signupWithOrg(
  app: FastifyInstance,
  email: string,
  slug: string,
) {
  const cookie = await signup(app, email);
  const res = await app.inject({
    method: "POST",
    url: "/v1/organizations",
    headers: { cookie },
    payload: { name: slug, slug },
  });
  return { cookie, orgId: res.json().organization.id as string };
}

/** signupWithOrg + a workspace, since almost everything needs one. */
export async function signupWithWorkspace(
  app: FastifyInstance,
  email: string,
  slug: string,
) {
  const { cookie, orgId } = await signupWithOrg(app, email, slug);
  const res = await app.inject({
    method: "POST",
    url: "/v1/workspaces",
    headers: { cookie },
    payload: { name: "Client Work", type: "open" },
  });
  return { cookie, orgId, workspaceId: res.json().workspace.id as string };
}
