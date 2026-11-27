import { motion } from "framer-motion";
import { createContext, useContext, type ReactNode } from "react";
import { ClaimStatusBadge, CLAIM_STATUS } from "@/components/ui/StatusIndicator";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";
import type { ClaimStatus } from "@/types";
import { ReadingIndicator, useNarratingSection } from "./Narration";
import { useResearch } from "./ResearchContext";
import { SourceFavicon, SourceMetaLine } from "./SourceMeta";

/* Building blocks shared by the paper and the legacy report layouts. */

/** Sections reveal progressively, like a document being set — not character streaming (PRD §28). */
export function Section({ id, title, children, index, className }: { id: string; title: ReactNode; children: ReactNode; index: number; className?: string }) {
  const { research } = useResearch();
  const reading = useNarratingSection(research.id, id);
  const embedded = useContext(EmbeddedCtx);
  const domId = embedded ? `rev-${research.id}-${id}` : id; // unique ids when a revision is shown inside another report
  const Heading = embedded ? "h5" : "h2"; // embedded under a follow-up (h3) and the revision's title (h4)
  return (
    <motion.section
      id={domId}
      aria-labelledby={`${domId}-h`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15 + index * 0.12, ease: ease.out }}
      className={cn("scroll-mt-24", className)}
    >
      <Heading id={`${domId}-h`} className={cn("font-display text-ink mb-5", embedded ? "text-[23px] sm:text-[25px]" : "text-[28px] sm:text-[30px]")}>
        {title}
        {reading && <ReadingIndicator paused={reading === "paused"} />}
      </Heading>
      {children}
    </motion.section>
  );
}

/** True inside a revision shown under a follow-up: smaller headings, unique ids, visible source list. */
export const EmbeddedCtx = createContext(false);

/** Claim-by-claim verification with the passages behind each claim. Collapsible in a paper (an appendix). */
export function EvidenceSection({ index, title = "Evidence", collapsible = false }: { index: number; title?: string; collapsible?: boolean }) {
  const { research, openSource } = useResearch();
  const counts = research.claims.reduce<Record<ClaimStatus, number>>((acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }), {
    supported: 0,
    partially_supported: 0,
    unsupported: 0,
    insufficient_evidence: 0,
  });
  const list = (
    <>
      <p className="text-[14px] text-ink-muted -mt-2 mb-5">
        Each important claim was checked against the collected evidence before it was written into the report.
      </p>
      <div className="flex flex-wrap gap-2 mb-6">
        {(Object.keys(counts) as ClaimStatus[])
          .filter((k) => counts[k] > 0)
          .map((k) => (
            <span key={k} className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-line text-[12.5px] text-ink-2">
              <span className={cn("size-2 rounded-full", CLAIM_STATUS[k].dot)} aria-hidden />
              {counts[k]} {CLAIM_STATUS[k].label.toLowerCase()}
            </span>
          ))}
      </div>
      <ol className="space-y-3">
        {research.claims.map((c, i) => {
          const ev = research.evidence.filter((e) => c.evidenceIds.includes(e.id));
          return (
            <li
              key={c.id}
              className={cn(
                "rounded-xl border p-4 sm:p-5",
                c.status === "insufficient_evidence" || c.status === "unsupported"
                  ? "border-dashed border-line-strong bg-transparent"
                  : "border-line bg-surface",
              )}
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[11.5px] font-medium text-ink-faint tabular">Claim {String(i + 1).padStart(2, "0")}</span>
                <ClaimStatusBadge status={c.status} />
                <span className="ml-auto text-[11.5px] text-ink-faint tabular">{Math.round(c.confidence * 100)}% confidence</span>
              </div>
              <p className={cn("text-[15px] leading-snug", c.status === "insufficient_evidence" ? "text-ink-muted" : "text-ink")}>{c.text}</p>
              {c.status === "insufficient_evidence" && (
                <p className="mt-2 text-[13px] text-ink-muted">
                  Pramaan couldn&rsquo;t find enough reliable evidence to support this claim, so it is not presented as a finding.
                </p>
              )}
              {ev.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {ev.map((e) => {
                    const idx = research.sourceIds.indexOf(e.sourceId) + 1;
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => openSource(e.sourceId)}
                          className="group w-full text-left flex gap-3 rounded-lg px-3 py-2.5 bg-subtle/60 hover:bg-subtle transition-colors"
                        >
                          <span className="grid place-items-center shrink-0 min-w-[18px] h-[18px] px-1 mt-0.5 rounded-[5px] bg-sage-soft text-sage-ink text-[10.5px] font-semibold tabular">
                            {idx}
                          </span>
                          <span className="font-display text-[16px] leading-snug text-ink-2 line-clamp-3">“{e.passage}”</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
  return (
    <Section id="evidence" title={title} index={index}>
      {collapsible ? (
        <details className="group rounded-xl border border-line bg-surface/50 p-4 sm:p-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none text-[14px] text-ink-2 flex items-center justify-between gap-3">
            <span>
              {research.claims.length} claims checked against {research.evidence.length} evidence passages
            </span>
            <span className="text-[13px] font-medium text-sage-ink group-open:hidden">Show</span>
            <span className="text-[13px] font-medium text-sage-ink hidden group-open:inline">Hide</span>
          </summary>
          <div className="mt-5">{list}</div>
        </details>
      ) : (
        list
      )}
    </Section>
  );
}

/**
 * The numbered source list. On screen, sources live in the side panel (or the Sources sheet on small screens);
 * this list is for printed / PDF copies, and is shown inside an embedded revision.
 */
export function SourcesSection({ index, title }: { index: number; title: string }) {
  const { sources, openSource } = useResearch();
  const embedded = useContext(EmbeddedCtx);
  return (
    <Section id="sources" title={title} index={index} className={embedded ? undefined : "hidden print:block"}>
      <ol className="space-y-1">
        {sources.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => openSource(s.id)}
              className="w-full text-left flex gap-4 py-3 px-3 -mx-3 rounded-lg hover:bg-subtle transition-colors"
            >
              <span className="text-[13px] font-medium text-ink-faint tabular w-6 pt-0.5">[{i + 1}]</span>
              <SourceFavicon source={s} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-ink leading-snug">{s.title}</span>
                <SourceMetaLine source={s} className="mt-1" />
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[12.5px] text-ink-faint">
        Citations are mapped deterministically from evidence to sources. Pramaan never generates citation links.
      </p>
    </Section>
  );
}
