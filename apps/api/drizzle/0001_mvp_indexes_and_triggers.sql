-- Generic updated_at trigger (docs/02-data-model.md §0: "mutable tables
-- add updated_at (maintained by trigger)"). Drizzle's schema builder has
-- no first-class trigger DSL, hence hand-written here.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "workspaces"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "boards"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "items"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "views"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "column_values"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "notification_preferences"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- MVP board-level search (docs/03-backend-architecture.md §8: "Postgres
-- FTS — generated tsvector on items.name and comments.body_text").
-- Expression indexes with function calls aren't expressible through
-- Drizzle's typed index builder, hence hand-written here.
CREATE INDEX "items_name_fts_idx" ON "items" USING gin (to_tsvector('simple', "name"));
--> statement-breakpoint
CREATE INDEX "comments_body_text_fts_idx" ON "comments" USING gin (to_tsvector('simple', "body_text"));
--> statement-breakpoint

-- ix_cv_people (docs/02-data-model.md §3.3): targeted partial GIN for
-- "assigned to me" lookups across boards. Trimmed to `user_ids` only —
-- the `tags` column type (which the doc also filters on) is V1, not MVP.
-- The `?` jsonb existence operator and jsonb_path_ops opclass aren't
-- expressible through Drizzle's typed index builder, hence hand-written.
CREATE INDEX "column_values_people_idx" ON "column_values" USING gin ("value" jsonb_path_ops) WHERE ("value" ? 'user_ids');
