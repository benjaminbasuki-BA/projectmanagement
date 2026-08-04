import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

/**
 * Runtime DB connection — connects as `app_user` (not the migration
 * owner), so RLS policies actually apply. See config/env.ts and
 * drizzle/0002_tenancy_and_rls.sql for why these are two different roles.
 */
const queryClient = postgres(env.APP_DATABASE_URL);

export const db = drizzle(queryClient, { schema });
