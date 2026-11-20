"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { IconButton } from "@/components/ui/IconButton";
import { ClaimStatusBadge } from "@/components/ui/StatusIndicator";
import { SOURCE_TYPE_LABEL } from "@/data/sources";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { formatDate } from "@/lib/utils/format";
import { useResearch } from "./ResearchContext";
import { RelevanceMeter, SourceFavicon, SourceTypeIcon } from "./SourceMeta";

/** Source details: metadata, exact supporting passages, supported claims, original link (PRD §25). */
export function SourceDrawer() {
  const { activeSourceId, closeSource, openSource, sources, research, indexOf } = useResearch();
  const isDesktop = useIsDesktop();
  const toast = useToast();
  const source = sources.find((s) => s.id === activeSourceId);
  const idx = source ? indexOf(source.id) : 0;
  const evidence = source ? research.evidence.filter((e) => e.sourceId === source.id) : [];
  const claims = source ? research.claims.filter((c) => c.sourceIds.includes(source.id)) : [];
  const isInternal = source?.url.startsWith("/");

  return (
    <Drawer
      open={Boolean(source)}
      onClose={closeSource}
      side={isDesktop ? "right" : "bottom"}
      title={source ? `Source ${idx} of ${sources.length}` : "Source"}
      headerExtra={
        source && (
          <>
            <IconButton label="Previous source" size="sm" disabled={idx <= 1} onClick={() => openSource(sources[idx - 2].id)}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <IconButton label="Next source" size="sm" disabled={idx >= sources.length} onClick={() => openSource(sources[idx].id)}>
              <ChevronRight className="size-4" />
            </IconButton>
          </>
        )
      }
    >
      {source && (
        <motion.div key={source.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="px-5 sm:px-6 py-5 space-y-7">
          <header>
            <div className="flex items-center gap-2.5">
              <motion.span layoutId={`src-idx-${source.id}`} className="grid place-items-center size-6 rounded-md bg-ink text-bg text-[11px] font-semibold tabular">
                {idx}
              </motion.span>
              <SourceFavicon source={source} size={24} />
              <span className="text-[13px] font-medium text-ink-2">{source.publisher}</span>
            </div>
            <h3 className="mt-4 font-display text-[26px] leading-[1.15] text-ink">{source.title}</h3>
            {source.authors && <p className="mt-2 text-[13px] text-ink-muted">{source.authors.join(", ")}</p>}
            <dl className="mt-5 grid grid-cols-2 gap-px rounded-lg overflow-hidden border border-line bg-line text-[12.5px]">
              {[
                ["Domain", source.domain],
                ["Published", formatDate(source.publishedAt)],
                ["Type", <span key="t" className="inline-flex items-center gap-1.5"><SourceTypeIcon type={source.type} />{SOURCE_TYPE_LABEL[source.type]}</span>],
                ["Relevance", <span key="r" className="inline-flex items-center gap-2"><RelevanceMeter value={source.relevance} />{Math.round(source.relevance * 100)}%</span>],
              ].map(([k, v]) => (
                <div key={String(k)} className="bg-surface px-3 py-2.5">
                  <dt className="text-ink-faint">{k}</dt>
                  <dd className="mt-0.5 text-ink-2 truncate">{v}</dd>
                </div>
              ))}
            </dl>
            {source.doi && <p className="mt-2 text-[12px] text-ink-faint">DOI {source.doi}</p>}
          </header>

          <section aria-labelledby="ev-h">
            <h4 id="ev-h" className="eyebrow mb-3">Supporting evidence</h4>
            {evidence.length ? (
              <ul className="space-y-3">
                {evidence.map((e) => (
                  <li key={e.id} className="relative rounded-lg bg-subtle/70 border border-line p-4">
                    <blockquote className="font-display text-[18px] leading-[1.45] text-ink">“{e.passage}”</blockquote>
                    <div className="mt-3 flex items-center justify-between text-[12px] text-ink-faint">
                      <span>{e.location ? `${e.location} · ` : ""}Match {Math.round(e.relevance * 100)}%</span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-ink"
                        onClick={() => {
                          navigator.clipboard?.writeText(`“${e.passage}” — ${source.publisher}`).catch(() => {});
                          toast({ title: "Passage copied." });
                        }}
                      >
                        <Copy className="size-3" /> Copy
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-ink-muted">This source was used for background context. No passage was quoted directly.</p>
            )}
          </section>

          <section aria-labelledby="cl-h">
            <h4 id="cl-h" className="eyebrow mb-3">Claims supported</h4>
            {claims.length ? (
              <ol className="space-y-2">
                {claims.map((c) => {
                  const n = research.claims.indexOf(c) + 1;
                  return (
                    <li key={c.id} className="flex gap-3 rounded-lg border border-line p-3">
                      <span className="text-[11.5px] font-medium text-ink-faint tabular pt-0.5">Claim {String(n).padStart(2, "0")}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] text-ink-2 leading-snug">{c.text}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <ClaimStatusBadge status={c.status} />
                          <span className="text-[11.5px] text-ink-faint tabular">{Math.round(c.confidence * 100)}% confidence</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-[13.5px] text-ink-muted">No specific claims are attributed to this source.</p>
            )}
          </section>

          <div className="flex flex-wrap gap-2 pb-2">
            {isInternal ? (
              <ButtonLink href={source.url} variant="primary" trailing={<ArrowUpRight className="size-4" />}>
                Open in library
              </ButtonLink>
            ) : (
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-ink text-bg text-sm font-medium hover:bg-ink-2 transition-colors active:scale-[0.98]">
                Open original source <ArrowUpRight className="size-4" />
              </a>
            )}
            <Badge tone="outline" className="h-10 px-3 rounded-md">
              Cited as [{idx}]
            </Badge>
          </div>
        </motion.div>
      )}
    </Drawer>
  );
}
