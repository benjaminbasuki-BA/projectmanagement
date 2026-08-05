import { and, eq, exists, gte, lte, not, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { columnValues, items } from "../../db/schema/index.js";
import type { AppDb } from "../../db/types.js";

/**
 * The `filter` query-param DSL (docs/04-api-design.md §3.4, docs/02 §4.1)
 * — same shape whether it comes from the Filter button, a saved view's
 * `settings.filters`, or NL search's `parsed_filter` (09 §3.9: "a
 * translation layer in front of the deterministic filter engine already
 * built, not a separate retrieval system"). One level of rules only — no
 * nested groups; nothing in the docs shows nesting and it keeps the SQL
 * builder honest.
 */
const COMPARATORS_BY_TYPE: Record<string, readonly string[]> = {
  text: ["contains", "is", "is_empty"],
  long_text: ["contains", "is", "is_empty"],
  number: ["eq", "neq", "gt", "lt", "between", "is_empty"],
  date: [
    "is",
    "before",
    "after",
    "last_n_days",
    "next_n_days",
    "overdue",
    "is_empty",
  ],
  status: ["is_any_of", "is_none_of"],
  dropdown: ["is_any_of", "is_none_of"],
  person: ["is_any_of", "is_me", "is_empty"],
  checkbox: ["is"],
};

const filterRuleSchema = z.object({
  column_id: z.string().uuid(),
  cmp: z.string(),
  value: z.unknown().optional(),
});
const filterGroupSchema = z.object({
  op: z.enum(["and", "or"]),
  rules: z.array(filterRuleSchema).min(1).max(20),
});
export type FilterRule = z.infer<typeof filterRuleSchema>;
export type FilterGroup = z.infer<typeof filterGroupSchema>;

export type ParseFilterResult =
  { success: true; filter: FilterGroup } | { success: false; error: string };

/** `?filter=` arrives as URL-encoded JSON text. */
export function parseFilterParam(raw: string): ParseFilterResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { success: false, error: "filter must be valid JSON" };
  }
  const parsed = filterGroupSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid filter shape",
    };
  }
  return { success: true, filter: parsed.data };
}

interface ColumnLike {
  id: string;
  type: string;
}

export type BuildFilterResult =
  { success: true; condition: SQL } | { success: false; error: string };

/**
 * Compiles a filter group into a single boolean SQL expression over
 * `items`, for use as an extra `and()` clause in an items query. Each
 * rule becomes an `EXISTS`/`NOT EXISTS` subquery against the sparse
 * `column_values` table scoped to `items.id` — a row only exists when
 * that cell is non-empty (02 §0), which is exactly what makes
 * `is_empty` a NOT EXISTS rather than a value comparison.
 */
export function buildFilterCondition(
  tx: AppDb,
  filter: FilterGroup,
  columnsById: Map<string, ColumnLike>,
  currentUserId: string,
): BuildFilterResult {
  const cellExists = (columnId: string, extra?: SQL) =>
    exists(
      tx
        .select({ one: sql`1` })
        .from(columnValues)
        .where(
          extra
            ? and(
                eq(columnValues.itemId, items.id),
                eq(columnValues.columnId, columnId),
                extra,
              )
            : and(
                eq(columnValues.itemId, items.id),
                eq(columnValues.columnId, columnId),
              ),
        ),
    );

  const conditions: SQL[] = [];
  for (const rule of filter.rules) {
    const column = columnsById.get(rule.column_id);
    if (!column) {
      return { success: false, error: `Unknown column: ${rule.column_id}` };
    }
    const allowed = COMPARATORS_BY_TYPE[column.type];
    if (!allowed?.includes(rule.cmp)) {
      return {
        success: false,
        error: `"${rule.cmp}" is not a valid comparator for a ${column.type} column`,
      };
    }
    const built = buildRuleCondition(column, rule, currentUserId, cellExists);
    if (!built.success) return built;
    conditions.push(built.condition);
  }

  const combined = filter.op === "and" ? and(...conditions) : or(...conditions);
  return { success: true, condition: combined! };
}

function buildRuleCondition(
  column: ColumnLike,
  rule: FilterRule,
  currentUserId: string,
  cellExists: (columnId: string, extra?: SQL) => SQL,
): BuildFilterResult {
  if (rule.cmp === "is_empty") {
    return { success: true, condition: not(cellExists(column.id)) };
  }

  switch (column.type) {
    case "text":
    case "long_text": {
      const value = typeof rule.value === "string" ? rule.value : "";
      if (rule.cmp === "contains") {
        return {
          success: true,
          condition: cellExists(
            column.id,
            sql`${columnValues.textValue} ilike ${"%" + value + "%"}`,
          ),
        };
      }
      if (rule.cmp === "is") {
        return {
          success: true,
          condition: cellExists(column.id, eq(columnValues.textValue, value)),
        };
      }
      break;
    }
    case "number": {
      if (rule.cmp === "between") {
        const [low, high] = Array.isArray(rule.value) ? rule.value : [];
        if (typeof low !== "number" || typeof high !== "number") break;
        return {
          success: true,
          condition: cellExists(
            column.id,
            and(
              gte(columnValues.numberValue, String(low)),
              lte(columnValues.numberValue, String(high)),
            ),
          ),
        };
      }
      const n = typeof rule.value === "number" ? rule.value : NaN;
      if (Number.isNaN(n)) break;
      const op = { eq: "=", neq: "!=", gt: ">", lt: "<" }[rule.cmp];
      if (!op) break;
      return {
        success: true,
        condition: cellExists(
          column.id,
          sql`${columnValues.numberValue}::numeric ${sql.raw(op)} ${n}`,
        ),
      };
    }
    case "date": {
      if (rule.cmp === "overdue") {
        return {
          success: true,
          condition: cellExists(
            column.id,
            sql`${columnValues.dateValue} < now()`,
          ),
        };
      }
      if (rule.cmp === "last_n_days" || rule.cmp === "next_n_days") {
        const days = typeof rule.value === "number" ? rule.value : NaN;
        if (Number.isNaN(days) || days < 0) break;
        const bound =
          rule.cmp === "last_n_days"
            ? and(
                gte(
                  columnValues.dateValue,
                  sql`now() - ${days + " days"}::interval`,
                ),
                lte(columnValues.dateValue, sql`now()`),
              )
            : and(
                gte(columnValues.dateValue, sql`now()`),
                lte(
                  columnValues.dateValue,
                  sql`now() + ${days + " days"}::interval`,
                ),
              );
        return { success: true, condition: cellExists(column.id, bound) };
      }
      if (["is", "before", "after"].includes(rule.cmp)) {
        const date = typeof rule.value === "string" ? rule.value : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) break;
        // dateValue is timestamptz. Casting it straight to ::date truncates
        // in the *session* timezone, not UTC, which silently shifts the
        // day by one near midnight depending on server config — so this
        // anchors the comparison boundary explicitly at UTC midnight
        // instead of trusting an implicit cast.
        const utcMidnight = sql`${date}::date::timestamp at time zone 'utc'`;
        if (rule.cmp === "is") {
          return {
            success: true,
            condition: cellExists(
              column.id,
              and(
                gte(columnValues.dateValue, utcMidnight),
                sql`${columnValues.dateValue} < ${utcMidnight} + interval '1 day'`,
              ),
            ),
          };
        }
        // "before" that date = anything strictly earlier than its own
        // midnight; "after" = anything on or past the *next* day's
        // midnight, so the date itself doesn't count as "after" itself.
        const boundary =
          rule.cmp === "before"
            ? utcMidnight
            : sql`${utcMidnight} + interval '1 day'`;
        const op = rule.cmp === "before" ? "<" : ">=";
        return {
          success: true,
          condition: cellExists(
            column.id,
            sql`${columnValues.dateValue} ${sql.raw(op)} ${boundary}`,
          ),
        };
      }
      break;
    }
    case "status": {
      const ids = Array.isArray(rule.value)
        ? rule.value.filter((v) => typeof v === "string")
        : [];
      if (ids.length === 0) break;
      const inList = sql`${columnValues.value} ->> 'label_id' in ${ids}`;
      return {
        success: true,
        condition:
          rule.cmp === "is_any_of"
            ? cellExists(column.id, inList)
            : not(cellExists(column.id, inList)),
      };
    }
    case "dropdown": {
      const ids = Array.isArray(rule.value)
        ? rule.value.filter((v) => typeof v === "string")
        : [];
      if (ids.length === 0) break;
      const overlap = sql`${columnValues.value} -> 'option_ids' ?| ${sqlStringArray(ids)}`;
      return {
        success: true,
        condition:
          rule.cmp === "is_any_of"
            ? cellExists(column.id, overlap)
            : not(cellExists(column.id, overlap)),
      };
    }
    case "person": {
      if (rule.cmp === "is_me") {
        return {
          success: true,
          condition: cellExists(
            column.id,
            sql`${columnValues.value} -> 'user_ids' ? ${currentUserId}`,
          ),
        };
      }
      const ids = Array.isArray(rule.value)
        ? rule.value.filter((v) => typeof v === "string")
        : [];
      if (ids.length === 0) break;
      const overlap = sql`${columnValues.value} -> 'user_ids' ?| ${sqlStringArray(ids)}`;
      return { success: true, condition: cellExists(column.id, overlap) };
    }
    case "checkbox": {
      const checked = rule.value === true;
      return {
        success: true,
        condition: cellExists(
          column.id,
          sql`(${columnValues.value} ->> 'checked')::boolean = ${checked}`,
        ),
      };
    }
  }

  return {
    success: false,
    error: `Invalid value for "${rule.cmp}" on column ${rule.column_id}`,
  };
}

/**
 * A Postgres `text[]` literal for the `?|` (any-key-exists) jsonb
 * operator — built server-side from already-validated string ids, never
 * from raw user text, so string-literal escaping here is just belt and
 * suspenders (single quotes doubled), not the only line of defense.
 */
function sqlStringArray(values: string[]) {
  return sql.raw(
    `array[${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(",")}]`,
  );
}
