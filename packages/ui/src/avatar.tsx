import { cn } from "./cn";
import { colorForString } from "./colors";

export function Avatar({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-mono font-medium text-white select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        backgroundColor: colorForString(name),
      }}
    >
      {initials || "?"}
    </span>
  );
}

/**
 * Flat identity mark for a board or workspace (design.md §5.3). In an
 * agency a board *is* a client engagement, so the sidebar is really a
 * client list — a deterministic solid color reads as identity at a glance.
 *
 * Replaced the gradient tile on 2026-07-30: gradients are banned in the
 * interface (design.md §3.5) because they compete with the status layer.
 */
export function IdentityMark({
  name,
  size = 3,
  height,
  className,
}: {
  name: string;
  /** Bar thickness in px. */
  size?: number;
  /** Bar height in px; defaults to filling its container. */
  height?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("block shrink-0 rounded-fill", className)}
      style={{
        width: size,
        height: height ?? "100%",
        backgroundColor: colorForString(name),
      }}
    />
  );
}

/** Overlapping avatar row with a +N overflow chip (§G.4). */
export function AvatarStack({
  names,
  size = 24,
  max = 5,
}: {
  names: string[];
  size?: number;
  max?: number;
}) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((n, i) => (
        <Avatar
          key={`${n}-${i}`}
          name={n}
          size={size}
          className="ring-2 ring-sheet"
        />
      ))}
      {overflow > 0 && (
        <span
          className="flex items-center justify-center rounded-full bg-neutral-200 font-medium text-neutral-600 ring-2 ring-sheet"
          style={{
            width: size,
            height: size,
            fontSize: Math.round(size * 0.38),
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
