import type { FastifyInstance } from "fastify";

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
