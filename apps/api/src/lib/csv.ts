/**
 * Shared CSV cell formatting — used by both the per-board export
 * (items/export.routes.ts) and the account-level "export all boards"
 * zip (organizations/data-export.routes.ts) so the two never drift on
 * how a column type renders to text.
 */
export function formatCellForCsv(
  type: string,
  cv: { value: unknown; textValue: string | null } | undefined,
  nameById: Map<string, string>,
): string {
  if (!cv) return "";
  const value = cv.value as Record<string, unknown>;
  switch (type) {
    case "status":
    case "dropdown":
    case "text":
    case "long_text":
      return cv.textValue ?? "";
    case "number":
      return typeof value.number === "number" ? String(value.number) : "";
    case "date":
      return typeof value.date === "string" ? value.date : "";
    case "checkbox":
      return value.checked ? "Yes" : "No";
    case "person": {
      const ids = (value.user_ids as string[] | undefined) ?? [];
      return ids.map((id) => nameById.get(id) ?? id).join("; ");
    }
    default:
      return cv.textValue ?? "";
  }
}

/** RFC 4180: quote a field if it contains a comma, quote, or newline. */
export function csvEscape(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
