import { z } from "zod";

/**
 * docs/02-data-model.md Appendix A — canonical `value` shape per column
 * type, and what gets extracted into text_value/number_value/date_value.
 * Only the 8 MVP column types are handled (matching boards/schemas.ts's
 * MVP_COLUMN_TYPES); `formula`/`mirror`/etc. don't exist yet.
 */

const statusValueSchema = z.object({ label_id: z.string() });
const textValueSchema = z.object({ text: z.string() });
const numberValueSchema = z.object({ number: z.number() });
const personValueSchema = z.object({ user_ids: z.array(z.string()) });
const dateValueSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Expected HH:MM")
    .nullable()
    .optional(),
});
const dropdownValueSchema = z.object({ option_ids: z.array(z.string()) });
const checkboxValueSchema = z.object({ checked: z.boolean() });

const valueSchemaByType: Record<string, z.ZodTypeAny> = {
  status: statusValueSchema,
  text: textValueSchema,
  long_text: textValueSchema,
  number: numberValueSchema,
  person: personValueSchema,
  date: dateValueSchema,
  dropdown: dropdownValueSchema,
  checkbox: checkboxValueSchema,
};

interface ColumnLike {
  id: string;
  type: string;
  settings: unknown;
}

interface Extracted {
  value: Record<string, unknown>;
  textValue: string | null;
  numberValue: number | null;
  dateValue: Date | null;
}

export type ColumnValueResult =
  { success: true; data: Extracted } | { success: false; error: string };

/**
 * Validates a submitted cell value against its column's type, then
 * derives the extracted text_value/number_value/date_value columns
 * (docs/02 Appendix A) — including resolving status/dropdown label text
 * out of the column's own `settings.labels`/`settings.options`, which
 * the canonical `value` only stores as an id.
 */
export function resolveColumnValue(
  column: ColumnLike,
  rawValue: unknown,
): ColumnValueResult {
  const schema = valueSchemaByType[column.type];
  if (!schema) {
    return { success: false, error: `Unsupported column type: ${column.type}` };
  }

  const parsed = schema.safeParse(rawValue);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid value for a ${column.type} column: ${parsed.error.message}`,
    };
  }
  const value = parsed.data as Record<string, unknown>;

  switch (column.type) {
    case "status": {
      const labelId = value.label_id as string;
      const label = findLabel(column.settings, labelId);
      if (!label) {
        return { success: false, error: `Unknown label_id: ${labelId}` };
      }
      return {
        success: true,
        data: {
          value,
          textValue: label.text,
          numberValue: null,
          dateValue: null,
        },
      };
    }
    case "text":
    case "long_text":
      return {
        success: true,
        data: {
          value,
          textValue: value.text as string,
          numberValue: null,
          dateValue: null,
        },
      };
    case "number":
      return {
        success: true,
        data: {
          value,
          textValue: null,
          numberValue: value.number as number,
          dateValue: null,
        },
      };
    case "person":
      // GIN indexing on person columns (02 §3.3 ix_cv_people) is out of
      // scope here — no text/number/date extraction applies.
      return {
        success: true,
        data: { value, textValue: null, numberValue: null, dateValue: null },
      };
    case "date": {
      const time = (value.time as string | null | undefined) ?? "00:00";
      const dateValue = new Date(`${value.date}T${time}:00.000Z`);
      if (Number.isNaN(dateValue.getTime())) {
        return { success: false, error: "Invalid date/time" };
      }
      return {
        success: true,
        data: { value, textValue: null, numberValue: null, dateValue },
      };
    }
    case "dropdown": {
      const optionIds = value.option_ids as string[];
      const labels = optionIds.map((id) => findOption(column.settings, id));
      if (labels.some((l) => l === null)) {
        return { success: false, error: "Unknown option_id in option_ids" };
      }
      return {
        success: true,
        data: {
          value,
          textValue: (labels as string[]).join(", ") || null,
          numberValue: null,
          dateValue: null,
        },
      };
    }
    case "checkbox":
      return {
        success: true,
        data: {
          value,
          textValue: null,
          numberValue: value.checked ? 1 : 0,
          dateValue: null,
        },
      };
    default:
      return {
        success: false,
        error: `Unsupported column type: ${column.type}`,
      };
  }
}

function findLabel(
  settings: unknown,
  labelId: string,
): { id: string; text: string } | null {
  const labels = (settings as { labels?: { id: string; text: string }[] })
    ?.labels;
  return labels?.find((l) => l.id === labelId) ?? null;
}

function findOption(settings: unknown, optionId: string): string | null {
  const options = (settings as { options?: { id: string; text: string }[] })
    ?.options;
  return options?.find((o) => o.id === optionId)?.text ?? null;
}
