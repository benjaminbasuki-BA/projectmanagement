import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Standard empty state (§C.7): icon + one-line headline + one-line body
 * + one primary action. Never a bare "No data".
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-neutral-800">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-neutral-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
