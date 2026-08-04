import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-8 rounded-sm border border-rule bg-paper px-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-ink focus:ring-1 focus:ring-ink",
        className,
      )}
      {...props}
    />
  );
}
