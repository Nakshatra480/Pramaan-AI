import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function SettingsPage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-[34px] text-ink">{title}</h1>
      {description && <p className="mt-1.5 text-[14.5px] text-ink-muted">{description}</p>}
      <div className="mt-8 space-y-10">{children}</div>
    </div>
  );
}

export function SettingsSection({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13.5px] text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-line bg-surface divide-y divide-line [&>*]:px-5 [&>*]:py-4", className)}>{children}</div>;
}
