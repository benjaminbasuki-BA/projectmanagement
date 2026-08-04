import { customType } from "drizzle-orm/pg-core";

/**
 * Case-insensitive text (docs/02-data-model.md §0 naming conventions).
 * Requires the `citext` extension — enabled in the first migration.
 * Drizzle's pg-core has no first-class citext() builder, hence customType.
 */
export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

/**
 * Binary data (hashed tokens, encrypted secrets). Drizzle's pg-core has
 * no first-class bytea() builder, hence customType.
 */
export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});
