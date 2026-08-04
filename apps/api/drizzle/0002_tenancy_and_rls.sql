-- Non-superuser application role (docs/03-backend-architecture.md §4:
-- "Postgres RLS on all tenant tables... the pool sets SET LOCAL
-- app.org_id per transaction").
--
-- RLS policies (added in 0004, once the columns they depend on exist)
-- only mean anything if the connecting role isn't a table owner/
-- superuser — Postgres exempts owners from RLS by default, and the
-- POSTGRES_USER role from docker-compose.yml is a superuser (bootstrap
-- role), so RLS would silently no-op against it. apps/api's runtime
-- connects as this role instead; migrations keep running as the owner.
--
-- Dev-only password, matching docker-compose.yml's existing convention
-- (trellis/trellis) — production provisions this role and rotates its
-- password via Secrets Manager (03 §2), never via migration history.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user_dev_password';
  END IF;
END
$$;
--> statement-breakpoint
-- No explicit GRANT CONNECT: a fresh database grants CONNECT to PUBLIC by
-- default, so this isn't needed unless that default was revoked.
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint
-- Applies to the 25 tables already created by 0000; table privileges
-- (not RLS) still gate access even once RLS is added in 0004.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
--> statement-breakpoint
-- Covers tables created by *future* migrations too, so this doesn't need
-- repeating every time a new table is added. Uses current_user via
-- dynamic SQL rather than a hardcoded role name (ALTER DEFAULT PRIVILEGES
-- FOR ROLE requires a literal identifier, not a function call) so this
-- migration isn't coupled to docker-compose.yml's specific POSTGRES_USER
-- value — it works under whatever role actually runs the migration.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user',
    current_user
  );
END
$$;
