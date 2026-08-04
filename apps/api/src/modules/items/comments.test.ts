import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../test/db.js";
import { buildServer } from "../../server.js";
import { signupWithWorkspace } from "../../test/helpers.js";
import type { AppDb } from "../../db/types.js";

async function setup(app: FastifyInstance, email: string, slug: string) {
  const { cookie, orgId, workspaceId } = await signupWithWorkspace(
    app,
    email,
    slug,
  );
  const boardRes = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${workspaceId}/boards`,
    headers: { cookie },
    payload: { name: "Acme — Website Redesign", type: "main" },
  });
  const boardId = boardRes.json().board.id as string;

  const groupRes = await app.inject({
    method: "POST",
    url: `/v1/boards/${boardId}/groups`,
    headers: { cookie },
    payload: { title: "Backlog" },
  });
  const groupId = groupRes.json().group.id as string;

  const itemRes = await app.inject({
    method: "POST",
    url: `/v1/boards/${boardId}/items`,
    headers: { cookie },
    payload: { name: "Homepage hero copy", groupId },
  });
  const itemId = itemRes.json().item.id as string;

  return { cookie, orgId, boardId, groupId, itemId };
}

async function postComment(
  app: FastifyInstance,
  cookie: string,
  itemId: string,
  bodyText: string,
  parentCommentId?: string,
) {
  return app.inject({
    method: "POST",
    url: `/v1/items/${itemId}/comments`,
    headers: { cookie },
    payload: { bodyText, parentCommentId },
  });
}

describe("comments", () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await buildServer(db);
  });

  it("posts a comment and lists it with author + empty reactions", async () => {
    const { cookie, itemId } = await setup(app, "c1@test.dev", "c1-org");

    const post = await postComment(app, cookie, itemId, "Looking good so far");
    expect(post.statusCode).toBe(201);
    const comment = post.json().comment;
    expect(comment.bodyText).toBe("Looking good so far");
    expect(comment.authorName).toBeTruthy();
    expect(comment.reactions).toEqual([]);

    const list = await app.inject({
      method: "GET",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().comments).toHaveLength(1);
    expect(list.json().comments[0].id).toBe(comment.id);
  });

  it("allows one level of replies but rejects a reply to a reply", async () => {
    const { cookie, itemId } = await setup(app, "c2@test.dev", "c2-org");

    const root = await postComment(app, cookie, itemId, "Original update");
    const rootId = root.json().comment.id as string;

    const reply = await postComment(app, cookie, itemId, "A reply", rootId);
    expect(reply.statusCode).toBe(201);
    const replyId = reply.json().comment.id as string;

    const nested = await postComment(
      app,
      cookie,
      itemId,
      "Reply to a reply",
      replyId,
    );
    expect(nested.statusCode).toBe(422);
    expect(nested.json().type).toContain("nested-reply");
  });

  it("lets the author edit their own comment, setting editedAt", async () => {
    const { cookie, itemId } = await setup(app, "c3@test.dev", "c3-org");
    const post = await postComment(app, cookie, itemId, "Original text");
    const commentId = post.json().comment.id as string;

    const editByAuthor = await app.inject({
      method: "PATCH",
      url: `/v1/comments/${commentId}`,
      headers: { cookie },
      payload: { bodyText: "Edited text" },
    });
    expect(editByAuthor.statusCode).toBe(200);
    expect(editByAuthor.json().comment.bodyText).toBe("Edited text");
    expect(editByAuthor.json().comment.editedAt).toBeTruthy();
  });

  it("soft-deletes a comment and redacts its body on subsequent reads", async () => {
    const { cookie, itemId } = await setup(app, "c4@test.dev", "c4-org");
    const post = await postComment(app, cookie, itemId, "Oops, wrong item");
    const commentId = post.json().comment.id as string;

    const del = await app.inject({
      method: "DELETE",
      url: `/v1/comments/${commentId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({
      method: "GET",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie },
    });
    const deleted = list
      .json()
      .comments.find((c: { id: string }) => c.id === commentId);
    expect(deleted.deletedAt).toBeTruthy();
    expect(deleted.bodyText).toBe("");

    // Editing a deleted comment is rejected.
    const edit = await app.inject({
      method: "PATCH",
      url: `/v1/comments/${commentId}`,
      headers: { cookie },
      payload: { bodyText: "Undelete attempt" },
    });
    expect(edit.statusCode).toBe(409);
  });

  it("toggles reactions idempotently and removes them independently per user", async () => {
    const { cookie, itemId } = await setup(app, "c5@test.dev", "c5-org");
    const post = await postComment(app, cookie, itemId, "Nice work");
    const commentId = post.json().comment.id as string;

    const react1 = await app.inject({
      method: "PUT",
      url: `/v1/comments/${commentId}/reactions/%F0%9F%91%8D`,
      headers: { cookie },
    });
    expect(react1.statusCode).toBe(204);

    // Reacting again with the same emoji is a no-op, not a duplicate/error.
    const react2 = await app.inject({
      method: "PUT",
      url: `/v1/comments/${commentId}/reactions/%F0%9F%91%8D`,
      headers: { cookie },
    });
    expect(react2.statusCode).toBe(204);

    const list = await app.inject({
      method: "GET",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie },
    });
    expect(list.json().comments[0].reactions).toHaveLength(1);

    const remove = await app.inject({
      method: "DELETE",
      url: `/v1/comments/${commentId}/reactions/%F0%9F%91%8D`,
      headers: { cookie },
    });
    expect(remove.statusCode).toBe(204);

    const listAfter = await app.inject({
      method: "GET",
      url: `/v1/items/${itemId}/comments`,
      headers: { cookie },
    });
    expect(listAfter.json().comments[0].reactions).toHaveLength(0);
  });

  it("never shows one org's item comments to another org (cross-tenant isolation)", async () => {
    const a = await setup(app, "c6a@test.dev", "c6a-org");
    await setup(app, "c6b@test.dev", "c6b-org");
    const b = await signupWithWorkspace(app, "c6c@test.dev", "c6c-org");

    const res = await app.inject({
      method: "GET",
      url: `/v1/items/${a.itemId}/comments`,
      headers: { cookie: b.cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("records a comment.posted activity event", async () => {
    const { cookie, itemId, boardId } = await setup(
      app,
      "c7@test.dev",
      "c7-org",
    );
    await postComment(app, cookie, itemId, "Kicking off the thread");

    const activity = await app.inject({
      method: "GET",
      url: `/v1/boards/${boardId}/activity`,
      headers: { cookie },
    });
    expect(activity.statusCode).toBe(200);
    const events = activity.json().events as { eventType: string }[];
    expect(events.some((e) => e.eventType === "comment.posted")).toBe(true);
  });
});
