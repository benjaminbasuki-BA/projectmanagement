-- Row-Level Security (docs/03-backend-architecture.md §4: "Postgres RLS
-- on all tenant tables — USING (org_id = current_setting('app.org_id')::uuid);
-- the pool sets SET LOCAL app.org_id per transaction. A cross-tenant leak
-- now needs two independent bugs.") Defense in depth on top of the
-- app-layer TenantContext middleware — not a replacement for it.
--
-- current_setting(..., true) returns NULL when the GUC has genuinely
-- never been touched this session, but once any transaction has called
-- set_config('app.org_id', ..., true) at least once, later reads outside
-- an active SET LOCAL scope return '' (empty string), not NULL — casting
-- '' straight to ::uuid throws a hard error instead of just failing to
-- match. NULLIF(..., '') normalizes both cases to NULL first, so
-- org_id = NULL correctly evaluates to "no match" (fails closed) either
-- way. Caught by src/db/tenant-db.test.ts's "fails closed" case, which
-- only exercises the codepath after an earlier transaction has already
-- set the GUC once — worth keeping that ordering, it's what makes the
-- test meaningful.
--
-- Excluded: `users` (global identity, not tenant-owned — access is
-- controlled by joining through org_memberships at the query layer),
-- `sessions` (user-scoped, not org-scoped), `notification_preferences`
-- (per-user global settings, no org_id column — see docs/02 §5.5).
--> statement-breakpoint

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "organizations"
  USING ("id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "org_memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "org_memberships"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "workspaces"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_members" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "workspace_members"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "boards" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "boards" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "boards"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "board_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "board_members" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "board_members"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "board_groups" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "board_groups" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "board_groups"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "items"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "columns" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "columns" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "columns"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "column_values" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "column_values" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "column_values"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "item_subscribers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "item_subscribers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "item_subscribers"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "views" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "views" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "views"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "comments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "comments"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "comment_reactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "comment_reactions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "comment_reactions"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "files"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attachments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "attachments"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "activity_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "activity_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "activity_events"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notifications"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "board_mutes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "board_mutes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "board_mutes"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "outbox" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outbox" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "outbox"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "ai_interactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_interactions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ai_interactions"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_logs"
  USING ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("org_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);
