import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Standard application page header: editorial title + quiet description + actions. */
export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
        <h1 className="font-display text-[38px] sm:text-[44px] text-ink">{title}</h1>
        {description && <p className="mt-2 text-[15px] text-ink-muted max-w-xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
