/**
 * Color utilities for the 20-label palette and entity colors
 * (docs/11-ui-design-system.md §G.1).
 */

/** Status/dropdown label, group, and monogram palette — the only colors user content may take. */
export const LABEL_PALETTE = [
  "#00C875", // green
  "#9CD326", // bright green
  "#00A9B8", // teal
  "#66CCFF", // cyan
  "#579BFC", // blue
  "#0073EA", // dark blue
  "#5559DF", // indigo
  "#A25DDC", // purple
  "#7E3B8A", // berry
  "#FF5AC4", // pink
  "#FF7575", // rose
  "#E2445C", // red
  "#BB3354", // dark red
  "#FF642E", // orange
  "#FDAB3D", // amber
  "#FFCB00", // yellow
  "#CAB641", // lime
  "#7F5347", // brown
  "#C4C4C4", // gray
  "#808080", // dark gray
] as const;

// Entity palette for avatars, board/workspace identity marks. Deepened
// 2026-07-30 (design.md §3.3 rationale): the previous monday-style neons
// failed 4.5:1 against the white initials drawn on them, and bloomed under
// the screen-share compression this product is designed for.
const ENTITY_COLORS = [
  "#3A5A80",
  "#3E7A52",
  "#9A5B12",
  "#A33C36",
  "#6A4382",
  "#256B70",
  "#B4501C",
  "#6E3C64",
];

/** Deterministic color for an entity name (avatar, workspace square). */
export function colorForString(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ENTITY_COLORS[Math.abs(h) % ENTITY_COLORS.length]!;
}

// NOTE: gradientForString/pastelForString were removed 2026-07-30.
// design.md §3.5 bans gradients in the interface — they compete with the
// status layer for attention. Board/workspace identity is a flat color from
// colorForString; see design.md §11 for the full rationale.

/**
 * Fill length for a status label, 0–1 (design.md §10 — the signature).
 * Length comes from data the product already has: a status column's
 * `settings.labels` array *is* an authored pipeline, so the label's index
 * in that order is its progress. Any `is_done` label renders full.
 */
export function statusFillRatio(
  labels: readonly { id: string; is_done?: boolean }[],
  labelId: string | undefined,
): number {
  if (!labelId || labels.length === 0) return 0;
  const index = labels.findIndex((l) => l.id === labelId);
  if (index < 0) return 0;
  if (labels[index]!.is_done) return 1;
  // First label reads as a stub rather than empty, so "not started" is still
  // visibly a value and not a missing cell.
  const MIN = 0.12;
  if (labels.length === 1) return MIN;
  return MIN + (index / (labels.length - 1)) * (1 - MIN);
}

// Palette entries whose chips need dark text to pass 4.5:1 (§G.1).
const DARK_TEXT_LABELS = new Set(["#FFCB00", "#CAB641", "#C4C4C4", "#9CD326"]);

/** Chip text color for a label background — never eyeball this (§G.1). */
export function labelTextColor(hex: string): string {
  const h = hex.toUpperCase();
  if (DARK_TEXT_LABELS.has(h)) return "#323338";
  const n = Number.parseInt(h.replace("#", ""), 16);
  if (Number.isNaN(n) || h.length !== 7) return "#ffffff";
  // Relative-luminance fallback for arbitrary hexes.
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return l > 0.55 ? "#323338" : "#ffffff";
}
