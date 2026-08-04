/**
 * Shared design system (docs/06-frontend-architecture.md §1–2,
 * docs/11-ui-design-system.md §G): Radix primitives + Tailwind classes,
 * shadcn/ui-style (vendored source, not an npm runtime dependency).
 * Tokens live in ./tokens.css — import it in the app root stylesheet.
 */
export { cn } from "./cn";
export {
  LABEL_PALETTE,
  colorForString,
  statusFillRatio,
  labelTextColor,
} from "./colors";
export { Button } from "./button";
export { Input } from "./input";
export { Badge } from "./badge";
export { Avatar, AvatarStack, IdentityMark } from "./avatar";
export { StatusFill, StatusDistribution } from "./status-fill";
export { Skeleton } from "./skeleton";
export { EmptyState } from "./empty-state";
export { Spinner, PageLoader } from "./spinner";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./dialog";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./dropdown-menu";
export { Popover, PopoverTrigger, PopoverClose, PopoverContent } from "./popover";
