/**
 * Hand-written fetch client for the scaffolding/MVP phase. Replace with
 * the generated packages/api-client once an OpenAPI spec exists (doc 04
 * §1). Every request sends credentials — the session lives in an
 * httpOnly cookie set by the API (doc 03 §3), and the Vite origin
 * (5173) differs from the API origin (3001).
 */

/** Also used for full-page redirects (OAuth), not just fetch. */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** RFC 9457 problem+json body (doc 04 §4). */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  errors?: { path?: (string | number)[]; message: string }[];
}

export class ApiError extends Error {
  status: number;
  problem: Problem;

  constructor(status: number, problem: Problem) {
    super(problem.detail ?? problem.title ?? `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? "GET",
    headers:
      init?.body !== undefined ? { "Content-Type": "application/json" } : {},
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "include",
  });

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data as Problem);
  return data as T;
}

// ---- Types (shapes as serialized by apps/api — camelCase) ----

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Me {
  user: User;
  activeOrgId: string | null;
  organization: { id: string; name: string; slug: string } | null;
  role: string | null;
  twoFactorEnabled: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
}

/** What this deployment supports — drives which sign-in options render. */
export interface AuthConfig {
  providers: { google: boolean };
  passwordMinLength: number;
  emailDelivery: "postmark" | "console";
}

/** Login either completes, or hands back a second-factor challenge. */
export type LoginResult =
  | { twoFactorRequired?: false; user: User }
  | { twoFactorRequired: true; challenge: string; expiresAt: string };

export interface Workspace {
  id: string;
  name: string;
  type: string;
}

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  type: string;
  itemTerminology: string;
  archivedAt: string | null;
}

export interface Group {
  id: string;
  boardId: string;
  title: string;
  color: string;
  position: string;
}

export interface StatusLabel {
  id: string;
  text: string;
  color: string;
  is_done: boolean;
}

export interface Column {
  id: string;
  boardId: string;
  title: string;
  type: string;
  settings: {
    labels?: StatusLabel[];
    options?: { id: string; text: string }[];
  };
  position: string;
  width?: number | null;
}

export interface Item {
  id: string;
  boardId: string;
  groupId: string;
  displaySeq: number;
  name: string;
  position: string;
}

export interface ColumnValue {
  itemId: string;
  columnId: string;
  value: Record<string, unknown>;
  textValue: string | null;
  numberValue: string | null;
  dateValue: string | null;
  updatedAt: string;
}

export interface Comment {
  id: string;
  itemId: string;
  parentCommentId: string | null;
  authorId: string;
  authorName: string;
  bodyText: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  reactions: { userId: string; emoji: string }[];
}

export interface ActivityEvent {
  id: string;
  boardId: string;
  itemId: string | null;
  actorId: string | null;
  actorName: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  boardSeq: number;
  createdAt: string;
}

export interface Notification {
  id: string;
  eventType: string;
  actorId: string | null;
  actorName: string | null;
  itemId: string | null;
  boardId: string | null;
  commentId: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

// ---- Auth ----

export function signup(input: {
  email: string;
  password: string;
  name: string;
}) {
  return request<{ user: User }>("/v1/auth/signup", {
    method: "POST",
    body: input,
  });
}

export function login(input: { email: string; password: string }) {
  return request<LoginResult>("/v1/auth/login", {
    method: "POST",
    body: input,
  });
}

export function authConfig() {
  return request<AuthConfig>("/v1/auth/config");
}

// ---- Password reset ----

/** Always resolves — the API never reveals whether the email is registered. */
export function forgotPassword(email: string) {
  return request<{ message: string }>("/v1/auth/password/forgot", {
    method: "POST",
    body: { email },
  });
}

export function resetPassword(input: { token: string; password: string }) {
  return request<void>("/v1/auth/password/reset", {
    method: "POST",
    body: input,
  });
}

// ---- Two-factor ----

export function startTwoFactorSetup() {
  return request<{ secret: string; otpauthUri: string; qrDataUrl: string }>(
    "/v1/auth/2fa/setup",
    { method: "POST" },
  );
}

export function enableTwoFactor(code: string) {
  return request<{ recoveryCodes: string[] }>("/v1/auth/2fa/enable", {
    method: "POST",
    body: { code },
  });
}

export function disableTwoFactor(password: string) {
  return request<void>("/v1/auth/2fa/disable", {
    method: "POST",
    body: { password },
  });
}

/** Exchanges a login challenge + code for a real session. */
export function verifyTwoFactor(input: { challenge: string; code: string }) {
  return request<{
    user: User;
    usedRecoveryCode: boolean;
    recoveryCodesRemaining: number;
  }>("/v1/auth/2fa/verify", { method: "POST", body: input });
}

export function logout() {
  return request<void>("/v1/auth/logout", { method: "POST" });
}

/** Returns null instead of throwing when there's no valid session. */
export async function me(): Promise<Me | null> {
  try {
    return await request<Me>("/v1/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

// ---- Organizations ----

export function createOrganization(input: { name: string; slug: string }) {
  return request<{ organization: { id: string; name: string; slug: string } }>(
    "/v1/organizations",
    { method: "POST", body: input },
  );
}

// ---- Workspaces ----

export function listWorkspaces() {
  return request<{ workspaces: Workspace[] }>("/v1/workspaces");
}

export function createWorkspace(input: { name: string }) {
  return request<{ workspace: Workspace }>("/v1/workspaces", {
    method: "POST",
    body: input,
  });
}

// ---- Boards ----

export function listBoards(workspaceId: string) {
  return request<{ boards: Board[] }>(`/v1/workspaces/${workspaceId}/boards`);
}

export function createBoard(workspaceId: string, input: { name: string }) {
  return request<{ board: Board }>(`/v1/workspaces/${workspaceId}/boards`, {
    method: "POST",
    body: input,
  });
}

export function getBoard(boardId: string) {
  return request<{ board: Board }>(`/v1/boards/${boardId}`);
}

export function updateBoard(
  boardId: string,
  input: { name?: string; description?: string | null },
) {
  return request<{ board: Board }>(`/v1/boards/${boardId}`, {
    method: "PATCH",
    body: input,
  });
}

// ---- Groups / Columns ----

export function listGroups(boardId: string) {
  return request<{ groups: Group[] }>(`/v1/boards/${boardId}/groups`);
}

export function createGroup(boardId: string, input: { title: string }) {
  return request<{ group: Group }>(`/v1/boards/${boardId}/groups`, {
    method: "POST",
    body: input,
  });
}

export function updateGroup(
  groupId: string,
  input: { title?: string; color?: string; position?: string },
) {
  return request<{ group: Group }>(`/v1/groups/${groupId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteGroup(groupId: string) {
  return request<void>(`/v1/groups/${groupId}`, { method: "DELETE" });
}

export function listColumns(boardId: string) {
  return request<{ columns: Column[] }>(`/v1/boards/${boardId}/columns`);
}

export function updateColumn(
  columnId: string,
  input: {
    title?: string;
    width?: number | null;
    position?: string;
    settings?: Record<string, unknown>;
  },
) {
  return request<{ column: Column }>(`/v1/columns/${columnId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteColumn(columnId: string) {
  return request<void>(`/v1/columns/${columnId}`, { method: "DELETE" });
}

export function createColumn(
  boardId: string,
  input: { title: string; type: string; settings?: Record<string, unknown> },
) {
  return request<{ column: Column }>(`/v1/boards/${boardId}/columns`, {
    method: "POST",
    body: input,
  });
}

// ---- Items ----

export function listItems(boardId: string) {
  return request<{ items: Item[]; columnValues: ColumnValue[] }>(
    `/v1/boards/${boardId}/items?include=column_values`,
  );
}

export function createItem(
  boardId: string,
  input: {
    name: string;
    groupId: string;
    columnValues?: Record<string, unknown>;
  },
) {
  return request<{ item: Item }>(`/v1/boards/${boardId}/items`, {
    method: "POST",
    body: input,
  });
}

export function updateItem(
  itemId: string,
  input: { name?: string; position?: string },
) {
  return request<{ item: Item }>(`/v1/items/${itemId}`, {
    method: "PATCH",
    body: input,
  });
}

export function archiveItem(itemId: string) {
  return request<{ item: Item }>(`/v1/items/${itemId}/archive`, {
    method: "POST",
  });
}

export function updateColumnValues(
  itemId: string,
  values: Record<string, unknown>,
) {
  return request<{ item: Item; columnValues: ColumnValue[] }>(
    `/v1/items/${itemId}/column-values`,
    { method: "PATCH", body: values },
  );
}

// ---- Comments ----

export function listComments(itemId: string) {
  return request<{ comments: Comment[] }>(`/v1/items/${itemId}/comments`);
}

export function createComment(
  itemId: string,
  input: { bodyText: string; parentCommentId?: string },
) {
  return request<{ comment: Comment }>(`/v1/items/${itemId}/comments`, {
    method: "POST",
    body: input,
  });
}

export function updateComment(commentId: string, bodyText: string) {
  return request<{ comment: Comment }>(`/v1/comments/${commentId}`, {
    method: "PATCH",
    body: { bodyText },
  });
}

export function deleteComment(commentId: string) {
  return request<void>(`/v1/comments/${commentId}`, { method: "DELETE" });
}

export function addReaction(commentId: string, emoji: string) {
  return request<void>(
    `/v1/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`,
    { method: "PUT" },
  );
}

export function removeReaction(commentId: string, emoji: string) {
  return request<void>(
    `/v1/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`,
    { method: "DELETE" },
  );
}

// ---- Activity ----

export function listItemActivity(itemId: string) {
  return request<{ events: ActivityEvent[] }>(`/v1/items/${itemId}/activity`);
}

// ---- Notifications ----

export function listNotifications(unreadOnly = false) {
  return request<{ notifications: Notification[] }>(
    `/v1/notifications${unreadOnly ? "?unread=true" : ""}`,
  );
}

export function unreadNotificationCount() {
  return request<{ count: number }>("/v1/notifications/unread-count");
}

export function markNotificationsRead(ids: string[]) {
  return request<void>("/v1/notifications/mark-read", {
    method: "POST",
    body: { ids },
  });
}

export function markAllNotificationsRead() {
  return request<void>("/v1/notifications/mark-all-read", { method: "POST" });
}

export function muteBoard(boardId: string) {
  return request<void>(`/v1/boards/${boardId}/mute`, { method: "PUT" });
}

export function unmuteBoard(boardId: string) {
  return request<void>(`/v1/boards/${boardId}/mute`, { method: "DELETE" });
}
