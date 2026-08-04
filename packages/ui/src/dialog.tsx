import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /** `center` for modals, `top` for the command palette. */
  position?: "center" | "top";
};

export function DialogContent({
  position = "center",
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="animate-overlay-in fixed inset-0 z-50 bg-neutral-900/40" />
      <DialogPrimitive.Content
        className={cn(
          "animate-panel-in fixed left-1/2 z-50 w-full max-w-md -translate-x-1/2 rounded-xl bg-white shadow-lg focus:outline-none",
          position === "center" ? "top-1/2 -translate-y-1/2 p-6" : "top-24",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold text-neutral-900", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("mt-1 text-sm text-neutral-500", className)}
      {...props}
    />
  );
}
