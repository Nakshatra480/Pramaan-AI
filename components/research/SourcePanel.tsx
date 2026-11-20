"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { formatYear } from "@/lib/utils/format";
import { SOURCE_TYPE_LABEL } from "@/data/sources";
import { useResearch } from "./ResearchContext";
import { RelevanceMeter, SourceFavicon } from "./SourceMeta";

/** Right-side source panel. Each card shows type, domain, date, relevance and evidence count. */
export function SourcePanel({ className, onSelect }: { className?: string; onSelect?: () => void }) {
  const { sources, research, openSource, activeSourceId } = useResearch();
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[13px] font-medium text-ink">Sources</h2>
        <span className="text-[12px] text-ink-faint tabular">
          {sources.length} cited · {research.metrics.sources} reviewed
        </span>
      </div>
      <ol className="space-y-1.5">
        {sources.map((s, i) => {
          const evidenceCount = research.evidence.filter((e) => e.sourceId === s.id).length;
          const claimCount = research.claims.filter((c) => c.sourceIds.includes(s.id)).length;
          const active = activeSourceId === s.id;
          return (
            <motion.li key={s.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i, duration: 0.35 }}>
              <button
                type="button"
                onClick={() => {
                  openSource(s.id);
                  onSelect?.();
                }}
                className={cn(
                  "group w-full text-left flex gap-3 p-3 rounded-lg border transition-[background-color,border-color,transform] duration-150",
                  active ? "bg-raised border-line-strong shadow-sm" : "border-transparent hover:bg-raised hover:border-line",
                )}
              >
                <span className="flex flex-col items-center gap-1.5 pt-0.5">
                  <motion.span layoutId={`src-idx-${s.id}`} className={cn("grid place-items-center size-5 rounded-[5px] text-[10.5px] font-semibold tabular", active ? "bg-ink text-bg" : "bg-sage-soft text-sage-ink")}>
                    {i + 1}
                  </motion.span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <SourceFavicon source={s} size={18} />
                    <span className="text-[12.5px] font-medium text-ink-2 truncate">{s.publisher}</span>
                    <span className="ml-auto text-[12px] text-ink-faint tabular">{formatYear(s.publishedAt)}</span>
                  </span>
                  <span className="mt-1.5 block text-[13px] leading-snug text-ink line-clamp-2">{s.title}</span>
                  <span className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-faint">
                    <span>{SOURCE_TYPE_LABEL[s.type]}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{s.domain}</span>
                    <span className="ml-auto inline-flex items-center gap-2">
                      {(evidenceCount > 0 || claimCount > 0) && (
                        <span className="inline-flex items-center gap-1 text-sage-ink" title={`${evidenceCount} passages · ${claimCount} claims`}>
                          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                          {claimCount} {claimCount === 1 ? "claim" : "claims"}
                        </span>
                      )}
                      <RelevanceMeter value={s.relevance} />
                    </span>
                  </span>
                </span>
              </button>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
