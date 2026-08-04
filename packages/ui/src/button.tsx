import type { ComponentProps } from "react";
import { cn } from "./cn";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  /** `icon` renders a square icon-only button. */
  size?: "sm" | "md" | "icon";
};

// Ink, not brand colour — the chrome carries no hue (design.md §3.1).
const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-ink text-paper hover:bg-deep",
  outline: "border border-rule bg-paper text-ink hover:border-ink-faint",
  ghost: "text-ink-muted hover:text-ink",
  danger: "bg-alert text-paper hover:opacity-90",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  icon: "h-8 w-8",
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
