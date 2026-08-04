import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Shimmer placeholder — shape it like the real layout, never a generic box (§G.4). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-sm bg-neutral-200/60", className)}
      {...props}
    />
  );
}
