import { BookMarked, FileText, Globe, Library, Newspaper, ScrollText } from "lucide-react";
import { SOURCE_TYPE_LABEL } from "@/data/sources";
import type { Source, SourceType } from "@/types";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";

const TYPE_ICON: Record<SourceType, typeof Globe> = {
  academic: BookMarked,
  web: Globe,
  news: Newspaper,
  documentation: FileText,
  report: ScrollText,
  library: Library,
};

export function SourceTypeIcon({ type, className }: { type: SourceType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return <Icon className={cn("size-3.5", className)} aria-hidden />;
}

/** Monogram favicon stand-in: first letter of the publisher, quiet and consistent. */
export function SourceFavicon({ source, size = 28 }: { source: Source; size?: number }) {
  const letter = source.type === "library" ? "" : source.publisher.replace(/^The /, "")[0];
  return (
    <span
      className={cn("inline-grid place-items-center shrink-0 rounded-md border font-display", source.type === "library" ? "bg-sage-soft border-sage-deep/60 text-sage-ink" : "bg-raised border-line text-ink-2")}
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-hidden
    >
      {source.type === "library" ? <Library className="size-3.5" /> : letter}
    </span>
  );
}

export function SourceMetaLine({ source, className }: { source: Source; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-faint", className)}>
      <span className="inline-flex items-center gap-1">
        <SourceTypeIcon type={source.type} />
        {SOURCE_TYPE_LABEL[source.type]}
      </span>
      <span aria-hidden>·</span>
      <span className="truncate">{source.domain}</span>
      <span aria-hidden>·</span>
      <time dateTime={source.publishedAt ?? undefined}>{formatDate(source.publishedAt, { month: "short", year: "numeric" })}</time>
    </p>
  );
}

/** Relevance as five small ticks — precise without looking like a score chart. */
export function RelevanceMeter({ value, className }: { value: number; className?: string }) {
  const filled = Math.round(value * 5);
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} role="img" aria-label={`Relevance ${Math.round(value * 100)}%`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={cn("h-2.5 w-[3px] rounded-full", i < filled ? "bg-accent" : "bg-line-strong")} />
      ))}
    </span>
  );
}
