import type { ReactNode } from "react";


/**
 * Shared chrome for every unauthenticated screen. Opens like a letterhead —
 * wordmark, rule, then the title in the document voice — so a signed-out
 * screen is recognisably the same product as a board (design.md §5.1).
 * Deliberately single-column: a decorative marketing panel next to a login
 * form is filler, and this product's argument is made by the boards.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen justify-center bg-frame px-6 py-12">
      <div className="w-full max-w-[420px]">
        {/* Masthead: wordmark, rule, title — the way a letterhead opens. */}
        <div className="border-b border-ink pb-2">
          <span className="font-serif text-[22px] tracking-tight text-ink">
            Trellis
          </span>
        </div>

        <div className="mt-8">
          <h1 className="font-serif text-[28px] leading-tight tracking-tight text-ink text-balance">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {subtitle}
            </p>
          )}
        </div>

        <div className="mt-7">{children}</div>

        {footer && (
          <div className="mt-7 border-t border-rule pt-4 text-sm text-ink-muted">
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}
