-- Auth completion: password reset, TOTP 2FA confirmation state, recovery
-- codes, and the short-lived challenge issued between "password accepted"
-- and "2FA verified" (docs/10-security-compliance.md §1).
--
-- RLS: these are user-scoped, not org-scoped, so they follow the same rule
-- as `sessions` and `users` in 0004 — excluded from RLS, reached only
-- through the auth module's own scoped queries, never through a tenant path.

CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" bytea NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_recovery_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" bytea NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Issued after a correct password when 2FA is on; exchanged for a real
-- session only once the TOTP (or a recovery code) verifies. Deliberately
-- NOT a row in `sessions` — an unverified factor must never be a session.
CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" bytea NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- A secret can exist before 2FA is confirmed (enrollment shows the QR,
-- then requires one valid code). Only a non-null value here means "on".
ALTER TABLE "users" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recovery_codes" ADD CONSTRAINT "user_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id") WHERE used_at is null;--> statement-breakpoint
CREATE INDEX "user_recovery_codes_user_idx" ON "user_recovery_codes" USING btree ("user_id") WHERE used_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_challenges_token_hash_key" ON "auth_challenges" USING btree ("token_hash");--> statement-breakpoint
-- 0002 sets default privileges for future tables, but those only apply to
-- tables created by the same role. Granting explicitly keeps this migration
-- correct regardless of which role runs it.
GRANT SELECT, INSERT, UPDATE, DELETE ON "password_reset_tokens" TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_recovery_codes" TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_challenges" TO app_user;
