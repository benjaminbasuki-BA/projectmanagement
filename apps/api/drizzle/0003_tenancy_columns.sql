ALTER TABLE "sessions" ADD COLUMN "active_org_id" uuid;--> statement-breakpoint
ALTER TABLE "board_members" ADD COLUMN "org_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "org_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "item_subscribers" ADD COLUMN "org_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD COLUMN "org_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "board_mutes" ADD COLUMN "org_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_org_id_organizations_id_fk" FOREIGN KEY ("active_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_subscribers" ADD CONSTRAINT "item_subscribers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_mutes" ADD CONSTRAINT "board_mutes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;