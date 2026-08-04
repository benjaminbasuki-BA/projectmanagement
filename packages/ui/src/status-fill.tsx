import type { ComponentProps } from "react";
import { cn } from "./cn";

type StatusFillProps = ComponentProps<"button"> & {
  /** Label color; omit for the empty ("no status yet") state. */
  color?: string;
  /** 0–1 pipeline position from `statusFillRatio` (design.md §10). */
  ratio?: number;
  /** Renders the ✓ affix; comes from the label's `is_done` flag. */
  isDone?: boolean;
  /** `cell` fills a table cell; `card` is the compact kanban/panel form. */
  variant?: "cell" | "card";
};

/**
 * THE SIGNATURE ELEMENT (design.md §10).
 *
 * A status is a bar whose *length* encodes pipeline position and whose
 * *color* encodes state — not a saturated full-cell block. Length is the
 * load-bearing channel so the value survives grayscale, colorblindness,
 * 40% scale, and the video compression of a client screen-share, which is
 * the constraint this whole product is designed against (design.md §1).
 *
 * Two signals in one mark: red at three-quarters length reads as "far
 * along and blocked" — the most actionable state in client work, and one
 * a colored dot cannot express.
 *
 * Do not reuse this shape for anything that isn't a real status value.
 */
export function StatusFill({
  color,
  ratio = 0,
  isDone = false,
  variant = "cell",
  type = "button",
  className,
  children,
  ...props
}: StatusFillProps) {
  const empty = !color;
  return (
    <button
      type={type}
      className={cn(
        "group/fill flex w-full items-center gap-2 px-1 text-left transition-colors hover:bg-frame/70 focus-visible:ring-1 focus-visible:ring-ink focus-visible:outline-none",
        variant === "cell" ? "h-full" : "h-auto py-0.5",
        className,
      )}
      {...props}
    >
      {/* The bar. Track stays visible so an empty cell still reads as a
          value slot rather than as missing data. Set beside the label
          rather than above it — at grid density the row is too short to
          stack, and this is what lets the column scan vertically. */}
      <span
        aria-hidden
        className="flex h-1 w-12 shrink-0 overflow-hidden bg-neutral-200"
      >
        <span
          className="h-full transition-[width] duration-120 ease-out"
          style={{
            width: `${Math.round((empty ? 0 : ratio) * 100)}%`,
            backgroundColor: color,
          }}
        />
      </span>
      <span
        className={cn(
          "truncate font-mono text-[11.5px] leading-none",
          empty ? "text-ink-faint" : "text-ink-muted",
        )}
      >
        {children || "—"}
        {isDone && <span aria-hidden> ✓</span>}
      </span>
    </button>
  );
}

/**
 * The same language in aggregate: one group's (or board's) status mix as a
 * single stacked bar. This is why MVP needs no chart widget to be
 * informative — a cell, a group, and a board all speak the same grammar
 * (design.md §10).
 */
export function StatusDistribution({
  segments,
  total,
  className,
}: {
  segments: readonly { id: string; text: string; color: string; count: number }[];
  total: number;
  className?: string;
}) {
  if (total <= 0 || segments.length === 0) return null;
  return (
    <span className={cn("flex h-1 overflow-hidden bg-neutral-200", className)}>
      {segments.map((s) => (
        <span
          key={s.id}
          title={`${s.text}: ${s.count} of ${total}`}
          style={{
            width: `${(s.count / total) * 100}%`,
            backgroundColor: s.color,
          }}
        />
      ))}
    </span>
  );
}
