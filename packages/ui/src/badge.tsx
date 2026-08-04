import type { ComponentProps, CSSProperties } from "react";
import { cn } from "./cn";

type BadgeProps = ComponentProps<"span"> & {
  /** Tints the badge from any hex (10% background, solid text) — §G.4. */
  color?: string;
};

export function Badge({ color, className, style, ...props }: BadgeProps) {
  const tint: CSSProperties | undefined = color
    ? { backgroundColor: `${color}1A`, color }
    : undefined;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        !color && "bg-neutral-100 text-neutral-600",
        className,
      )}
      style={{ ...tint, ...style }}
      {...props}
    />
  );
}
