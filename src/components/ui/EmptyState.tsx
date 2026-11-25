import type { ReactNode } from "react";
import { PramaanMark } from "@/components/brand/PramaanMark";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  compact?: boolean;
}

/** Branded empty state: the Pramaan mark sits quietly inside concentric guide rings (from docs/brand/theme.png). */
export function EmptyState({ title, description, action, icon, className, compact }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "py-10" : "py-16 sm:py-20", className)}>
      <div className="relative grid place-items-center size-28 mb-6" aria-hidden>
        <svg viewBox="0 0 112 112" className="absolute inset-0 text-line-strong">
          <circle cx="56" cy="56" r="54" fill="none" stroke="currentColor" strokeDasharray="2 4" />
          <circle cx="56" cy="56" r="36" fill="none" stroke="currentColor" strokeOpacity="0.6" />
          <line x1="56" y1="0" x2="56" y2="112" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 4" />
          <line x1="0" y1="56" x2="112" y2="56" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 4" />
        </svg>
        <span className="relative grid place-items-center size-14 rounded-2xl bg-surface border border-line shadow-sm text-ink-muted">
          {icon ?? <PramaanMark size={30} />}
        </span>
      </div>
      <h3 className="font-display text-[26px] text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-muted">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
