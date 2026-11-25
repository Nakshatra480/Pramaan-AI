import { motion } from "framer-motion";
import { FolderClosed, Info } from "lucide-react";
import { Link } from "@/components/ui/Link";
import { createContext, useContext, type ReactNode } from "react";
import { ClaimStatusBadge, CLAIM_STATUS } from "@/components/ui/StatusIndicator";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import type { ClaimStatus, Project } from "@/types";
import { ReadingIndicator, useNarratingSection } from "./Narration";
import { MODES } from "./research-options";
import { useResearch } from "./ResearchContext";
import { RichText } from "./RichText";
import { SourceFavicon, SourceMetaLine } from "./SourceMeta";

/** Sections reveal progressively, like a document being set — not character streaming (PRD §28). */
function Section({ id, title, children, index, className }: { id: string; title: string; children: ReactNode; index: number; className?: string }) {
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
const EmbeddedCtx = createContext(false);

export function ResearchReport({ project, actions, embedded = false }: { project?: Project | null; actions?: ReactNode; embedded?: boolean }) {
  return (
    <EmbeddedCtx.Provider value={embedded}>
      <ReportBody project={project} actions={actions} embedded={embedded} />
    </EmbeddedCtx.Provider>
  );
}

function ReportBody({ project, actions, embedded }: { project?: Project | null; actions?: ReactNode; embedded: boolean }) {
  const { research, sources, openSource } = useResearch();
  const report = research.report!;
  const counts = research.claims.reduce<Record<ClaimStatus, number>>(
    (acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }),
    { supported: 0, partially_supported: 0, unsupported: 0, insufficient_evidence: 0 },
  );

  return (
    <article className="max-w-[720px]">
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: ease.out }}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-muted">
          {project ? (
            <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1.5 hover:text-ink">
              <FolderClosed className="size-3.5" />
              {project.name}
            </Link>
          ) : (
            <span>Independent research</span>
          )}
          <span aria-hidden>·</span>
          <span>{MODES.find((m) => m.value === research.mode)?.label}</span>
          <span aria-hidden>·</span>
          <time dateTime={research.completedAt ?? research.createdAt}>{formatDate(research.completedAt ?? research.createdAt, { day: "numeric", month: "long", year: "numeric" })}</time>
        </div>
        {embedded ? (
          <h4 className="mt-3 font-display text-[28px] sm:text-[34px] leading-[1.08] text-ink text-balance">{research.title}</h4>
        ) : (
          <h1 className="mt-4 font-display text-[36px] sm:text-[48px] leading-[1.04] text-ink text-balance">{research.title}</h1>
        )}
        {!embedded && research.parentId && (
          <p className="mt-4 rounded-xl border border-line bg-subtle/60 px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">Revised version.</span>{" "}
            <Link href={`/research/${research.parentId}`} className="underline decoration-line-strong underline-offset-2 hover:text-ink">
              Open the original report
            </Link>
            {research.revisionInstructions ? <span className="text-ink-muted"> · Changes asked for: “{research.revisionInstructions}”</span> : null}
          </p>
        )}
        <p className="mt-4 text-[15px] text-ink-muted leading-relaxed">
          <span className="text-ink-faint">Question — </span>
          {research.query}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-2 tabular">
          <span>{research.metrics.sources} sources</span>
          <span className="text-line-strong" aria-hidden>·</span>
          <span>{research.metrics.evidence} evidence passages</span>
          <span className="text-line-strong" aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5 text-sage-ink font-medium">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            {research.metrics.verifiedClaims} verified claims
          </span>
        </div>

        {actions && <div className="mt-6">{actions}</div>}

        {research.preview && (
          <div className="mt-6 flex gap-3 rounded-xl border border-line bg-subtle/60 p-4 text-[13px] text-ink-muted" role="note">
            <Info className="size-4 mt-0.5 shrink-0 text-ink-faint" />
            <p>
              <span className="font-medium text-ink-2">Preview report.</span> The research backend isn&rsquo;t connected in this build, so Pramaan is showing saved evidence on the closest related topic
              {research.topic ? ` (${research.topic})` : ""}. Live research will investigate your exact question.
            </p>
          </div>
        )}
      </motion.header>

      <div className={cn(embedded ? "mt-10 space-y-11" : "mt-12 space-y-14")}>
        <Section id="summary" title="Executive Summary" index={0}>
          <div className="prose-report">
            {report.summary.map((p, i) => (
              <p key={i}>
                <RichText text={p} />
              </p>
            ))}
          </div>
        </Section>

        <Section id="findings" title="Key Findings" index={1}>
          <ol className="divide-y divide-line border-y border-line">
            {report.findings.map((f, i) => {
              const claims = research.claims.filter((c) => f.claimIds?.includes(c.id));
              return (
                <li key={i} className="grid grid-cols-[48px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)] gap-2 py-5">
                  <span className="font-display text-[28px] sm:text-[32px] leading-none text-ink-faint tabular">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-[16px] font-semibold text-ink">{f.title}</h3>
                    <p className="mt-1.5 text-[15.5px] leading-relaxed text-ink-2">
                      <RichText text={f.body} />
                    </p>
                    {claims.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {claims.map((c) => (
                          <ClaimStatusBadge key={c.id} status={c.status} />
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>

        <Section id="analysis" title="Detailed Analysis" index={2}>
          <div className="space-y-9">
            {report.analysis.map((s) => (
              <div key={s.heading}>
                <h3 className="text-[17px] font-semibold text-ink mb-3">{s.heading}</h3>
                <div className="prose-report">
                  {s.paragraphs.map((p, i) => (
                    <p key={i}>
                      <RichText text={p} />
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="evidence" title="Evidence" index={3}>
          <p className="text-[14px] text-ink-muted -mt-2 mb-5">Each important claim was checked against the collected evidence before it was written into the report.</p>
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
                <li key={c.id} className={cn("rounded-xl border p-4 sm:p-5", c.status === "insufficient_evidence" || c.status === "unsupported" ? "border-dashed border-line-strong bg-transparent" : "border-line bg-surface")}>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[11.5px] font-medium text-ink-faint tabular">Claim {String(i + 1).padStart(2, "0")}</span>
                    <ClaimStatusBadge status={c.status} />
                    <span className="ml-auto text-[11.5px] text-ink-faint tabular">{Math.round(c.confidence * 100)}% confidence</span>
                  </div>
                  <p className={cn("text-[15px] leading-snug", c.status === "insufficient_evidence" ? "text-ink-muted" : "text-ink")}>{c.text}</p>
                  {c.status === "insufficient_evidence" && <p className="mt-2 text-[13px] text-ink-muted">Pramaan couldn&rsquo;t find enough reliable evidence to support this claim, so it is not presented as a finding.</p>}
                  {ev.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {ev.map((e) => {
                        const idx = research.sourceIds.indexOf(e.sourceId) + 1;
                        return (
                          <li key={e.id}>
                            <button type="button" onClick={() => openSource(e.sourceId)} className="group w-full text-left flex gap-3 rounded-lg px-3 py-2.5 bg-subtle/60 hover:bg-subtle transition-colors">
                              <span className="grid place-items-center shrink-0 min-w-[18px] h-[18px] px-1 mt-0.5 rounded-[5px] bg-sage-soft text-sage-ink text-[10.5px] font-semibold tabular">{idx}</span>
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
        </Section>

        <Section id="limitations" title="Limitations" index={4}>
          <ul className="space-y-3 rounded-xl bg-subtle/60 border border-line p-5 sm:p-6">
            {report.limitations.map((l, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
                <span className="mt-[11px] size-1 rounded-full bg-ink-faint shrink-0" aria-hidden />
                <span>
                  <RichText text={l} />
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* On screen, sources live only in the side panel (or the Sources sheet on small screens);
            this list exists for printed / PDF copies so they keep their references. */}
        <Section id="sources" title="Sources" index={5} className={embedded ? undefined : "hidden print:block"}>
          <ol className="space-y-1">
            {sources.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => openSource(s.id)} className="w-full text-left flex gap-4 py-3 px-3 -mx-3 rounded-lg hover:bg-subtle transition-colors">
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
      </div>
    </article>
  );
}
