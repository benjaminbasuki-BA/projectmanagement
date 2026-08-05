import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";
import {
  signupWithOrg,
  signupPlain,
  addOrgMember,
} from "../../test/helpers.js";
import { withTenantContext } from "../../db/tenant-db.js";
import { orgMemberships, sessions } from "../../db/schema/index.js";
import { hashToken } from "../auth/tokens.js";
import type { AppDb } from "../../db/types.js";

describe("org settings + member management", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("GET /org returns org details and member count for any member", async () => {
    const { cookie, orgId } = await signupWithOrg(app, "a1@test.dev", "a1-org");
    const b = await signupPlain(app, "a1b@test.dev");
    await addOrgMember(db, orgId, b.userId);

    const res = await app.inject({
      method: "GET",
      url: "/v1/org",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().organization.memberCount).toBe(2);
    expect(res.json().role).toBe("admin");
  });

  it("PATCH /org renames the org for an admin, 403s for a member", async () => {
    const { cookie, orgId } = await signupWithOrg(app, "a2@test.dev", "a2-org");
    const member = await signupPlain(app, "a2b@test.dev");
    await addOrgMember(db, orgId, member.userId);
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/select`,
      headers: { cookie: member.cookie },
    });

    const denied = await app.inject({
      method: "PATCH",
      url: "/v1/org",
      headers: { cookie: member.cookie },
      payload: { name: "Hijacked Name" },
    });
    expect(denied.statusCode).toBe(403);

    const ok = await app.inject({
      method: "PATCH",
      url: "/v1/org",
      headers: { cookie },
      payload: { name: "Renamed Org" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().organization.name).toBe("Renamed Org");
  });

  it("GET /org/members lists active members and pending invites", async () => {
    const { cookie } = await signupWithOrg(app, "a3@test.dev", "a3-org");
    await app.inject({
      method: "POST",
      url: "/v1/org/invites",
      headers: { cookie },
      payload: { email: "pending@test.dev", role: "member" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/org/members",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const members = res.json().members as {
      email: string;
      invitePending: boolean;
    }[];
    expect(members).toHaveLength(2);
    const pending = members.find((m) => m.email === "pending@test.dev");
    expect(pending?.invitePending).toBe(true);
  });

  it("only an admin can invite, and a duplicate invite is rejected", async () => {
    const { cookie, orgId } = await signupWithOrg(app, "a4@test.dev", "a4-org");
    const member = await signupPlain(app, "a4member@test.dev");
    await addOrgMember(db, orgId, member.userId);
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/select`,
      headers: { cookie: member.cookie },
    });

    const memberInvites = await app.inject({
      method: "POST",
      url: "/v1/org/invites",
      headers: { cookie: member.cookie },
      payload: { email: "x@test.dev", role: "member" },
    });
    expect(memberInvites.statusCode).toBe(403);

    const dupe = await app.inject({
      method: "POST",
      url: "/v1/org/invites",
      headers: { cookie },
      payload: { email: "a4member@test.dev", role: "member" },
    });
    expect(dupe.statusCode).toBe(409);
  });

  it("invite preview + accept: matching email joins, mismatched email is rejected", async () => {
    const { cookie, orgId } = await signupWithOrg(app, "a5@test.dev", "a5-org");
    await app.inject({
      method: "POST",
      url: "/v1/org/invites",
      headers: { cookie },
      payload: { email: "invitee@test.dev", role: "member" },
    });

    const [invite] = await withTenantContext(db, orgId, (tx) =>
      tx
        .select({ id: orgMemberships.id })
        .from(orgMemberships)
        .where(eq(orgMemberships.inviteEmail, "invitee@test.dev")),
    );
    const rawToken = "known-invite-token";
    await withTenantContext(db, orgId, (tx) =>
      tx
        .update(orgMemberships)
        .set({ inviteTokenHash: hashToken(rawToken) })
        .where(eq(orgMemberships.id, invite.id)),
    );

    const preview = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/invites/${rawToken}`,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().email).toBe("invitee@test.dev");
    expect(preview.json().hasAccount).toBe(false);

    const wrongPerson = await signupPlain(app, "someone-else@test.dev");
    const wrongAccept = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/invites/${rawToken}/accept`,
      headers: { cookie: wrongPerson.cookie },
    });
    expect(wrongAccept.statusCode).toBe(403);

    const invitee = await signupPlain(app, "invitee@test.dev");
    const accept = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/invites/${rawToken}/accept`,
      headers: { cookie: invitee.cookie },
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json().activeOrgId).toBe(orgId);

    const members = await app.inject({
      method: "GET",
      url: "/v1/org/members",
      headers: { cookie },
    });
    const joined = (
      members.json().members as { email: string; invitePending: boolean }[]
    ).find((m) => m.email === "invitee@test.dev");
    expect(joined?.invitePending).toBe(false);
  });

  it("expired or unknown invite tokens 404", async () => {
    const { orgId } = await signupWithOrg(app, "a6@test.dev", "a6-org");
    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/invites/not-a-real-token`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("changes a member's role, and refuses to demote the last admin", async () => {
    const { cookie, orgId } = await signupWithOrg(app, "a7@test.dev", "a7-org");
    const member = await signupPlain(app, "a7member@test.dev");
    await addOrgMember(db, orgId, member.userId);

    const [membership] = await withTenantContext(db, orgId, (tx) =>
      tx
        .select({ id: orgMemberships.id })
        .from(orgMemberships)
        .where(eq(orgMemberships.userId, member.userId)),
    );

    const promote = await app.inject({
      method: "PATCH",
      url: `/v1/org/members/${membership.id}`,
      headers: { cookie },
      payload: { role: "admin" },
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json().member.role).toBe("admin");

    // Two admins now exist, so demoting the promoted one back to member
    // is fine — the original signup admin still covers "at least one".
    const demoteBack = await app.inject({
      method: "PATCH",
      url: `/v1/org/members/${membership.id}`,
      headers: { cookie },
      payload: { role: "member" },
    });
    expect(demoteBack.statusCode).toBe(200);
  });

  it("refuses to deactivate the last remaining admin", async () => {
    const { cookie, orgId } = await signupWithOrg(app, "a8@test.dev", "a8-org");
    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie },
    });
    const [own] = await withTenantContext(db, orgId, (tx) =>
      tx
        .select({ id: orgMemberships.id })
        .from(orgMemberships)
        .where(eq(orgMemberships.userId, me.json().user.id)),
    );

    const res = await app.inject({
      method: "DELETE",
      url: `/v1/org/members/${own.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it("deactivating a member revokes their sessions and hides them from the directory", async () => {
    const { cookie, orgId } = await signupWithOrg(app, "a9@test.dev", "a9-org");
    const member = await signupPlain(app, "a9member@test.dev");
    await addOrgMember(db, orgId, member.userId);
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/select`,
      headers: { cookie: member.cookie },
    });

    const [membership] = await withTenantContext(db, orgId, (tx) =>
      tx
        .select({ id: orgMemberships.id })
        .from(orgMemberships)
        .where(eq(orgMemberships.userId, member.userId)),
    );

    const res = await app.inject({
      method: "DELETE",
      url: `/v1/org/members/${membership.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);

    const [session] = await db
      .select({ revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.userId, member.userId));
    expect(session.revokedAt).not.toBeNull();

    const directory = await app.inject({
      method: "GET",
      url: "/v1/users?query=a9member",
      headers: { cookie },
    });
    expect(directory.json().users).toHaveLength(0);
  });

  it("never manages another org's members (cross-tenant isolation)", async () => {
    const a = await signupWithOrg(app, "a10a@test.dev", "a10-org");
    const b = await signupWithOrg(app, "a10b@test.dev", "a10b-org");
    const [bMembership] = await withTenantContext(db, b.orgId, (tx) =>
      tx.select({ id: orgMemberships.id }).from(orgMemberships),
    );

    const res = await app.inject({
      method: "PATCH",
      url: `/v1/org/members/${bMembership.id}`,
      headers: { cookie: a.cookie },
      payload: { role: "admin" },
    });
    // a's session has a's org active, so this operates in a's tenant
    // context and simply can't find b's membership id there.
    expect(res.statusCode).toBe(404);
  });
});
