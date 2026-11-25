import { ArrowUpRight, ExternalLink, RotateCcw, Sparkles } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { parseRichText } from "@/lib/utils/citations";
import { cn } from "@/lib/utils/cn";
import type { FollowUp, FollowUpSource } from "@/types";
import { ResearchProvider, useResearch } from "./ResearchContext";
import { ResearchReport } from "./ResearchReport";
import { RichText } from "./RichText";
import { SourceDrawer } from "./SourceDrawer";
import { ThinkingIndicator } from "./Thinking";

const ORIGIN: Record<FollowUpSource["origin"], string> = { report: "From this report", web: "Web", academic: "Scholarly" };

/**
 * A follow-up question's answer. `[n]` cites the n-th entry of the answer's own source list, which mixes
 * the report's sources (open in the side panel) with what a fresh web / scholarly search found (open the page).
 * Answers saved before per-answer sources existed cite the side panel's numbering instead.
 */
export function FollowUpAnswer({ followUp }: { followUp: FollowUp }) {
  const sources = followUp.sources ?? [];
  const legacy = sources.length === 0;
  return (
    <div className="mt-4">
      <div className="prose-report">
        {followUp.answer.map((p, i) => (
          <p key={i}>{legacy ? <RichText text={p} /> : <AnswerText text={p} sources={sources} />}</p>
        ))}
      </div>
      {!legacy && <AnswerSources sources={sources} />}
    </div>
  );
}

function AnswerText({ text, sources }: { text: string; sources: FollowUpSource[] }) {
  return (
    <>
      {parseRichText(text).map((seg, i) =>
        seg.type === "text" ? <Fragment key={i}>{seg.value}</Fragment> : <AnswerCitation key={i} index={seg.index} source={sources[seg.index - 1]} />,
      )}
    </>
  );
}

function useOpenSource() {
  const { openSource, research } = useResearch();
  return (s: FollowUpSource) => {
    if (s.sourceId && research.sourceIds.includes(s.sourceId)) openSource(s.sourceId);
    else window.open(s.url, "_blank", "noopener,noreferrer");
  };
}

function AnswerCitation({ index, source }: { index: number; source?: FollowUpSource }) {
  const open = useOpenSource();
  const { prefs } = usePreferences();
  if (!source) return <sup className="text-ink-faint">[{index}]</sup>;
  const numeric = prefs.citationStyle === "numeric";
  return (
    <button
      type="button"
      onClick={() => open(source)}
      title={`${source.title} — ${source.domain}`}
      aria-label={`Source ${index}: ${source.title} (${ORIGIN[source.origin]})`}
      className={cn(
        numeric
          ? "relative -top-[0.3em] mx-[1px] inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-[5px] text-[10.5px] font-semibold font-sans tabular leading-none align-baseline"
          : "mx-[1px] inline rounded-[4px] px-1 py-px font-sans text-[0.82em] font-medium leading-normal align-baseline",
        "touch-target transition-[background-color,transform] duration-150 hover:-translate-y-px",
        source.origin === "report" ? "bg-sage-soft text-sage-ink hover:bg-sage" : "bg-subtle text-ink-2 border border-line hover:border-line-strong",
      )}
    >
      {numeric ? index : `(${source.publisher || source.domain})`}
    </button>
  );
}

function AnswerSources({ sources }: { sources: FollowUpSource[] }) {
  const open = useOpenSource();
  const fresh = sources.filter((s) => s.origin !== "report").length;
  return (
    <div className="mt-5 rounded-xl border border-line bg-surface/60 p-3 sm:p-4">
      <p className="px-1 text-[12px] font-medium text-ink-muted">
        Sources for this answer{fresh ? ` · ${fresh} found by a new search` : ""}
      </p>
      <ol className="mt-2 space-y-0.5">
        {sources.map((s, i) => (
          <li key={`${s.url}-${i}`}>
            <button type="button" onClick={() => open(s)} className="group w-full text-left flex items-start gap-3 rounded-lg px-1.5 py-2 hover:bg-subtle transition-colors">
              <span className="mt-0.5 grid place-items-center shrink-0 min-w-[20px] h-5 px-1 rounded-[5px] bg-subtle text-[11px] font-semibold tabular text-ink-2">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-snug text-ink line-clamp-2">{s.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink-faint">
                  <span className={cn("rounded px-1.5 py-px text-[11px] font-medium", s.origin === "report" ? "bg-sage-soft text-sage-ink" : "bg-subtle text-ink-muted")}>{ORIGIN[s.origin]}</span>
                  <span className="truncate">{s.publisher && s.publisher !== s.domain ? `${s.publisher} · ${s.domain}` : s.domain}</span>
                  {s.publishedAt && <span>· {s.publishedAt.slice(0, 4)}</span>}
                </span>
              </span>
              {s.origin === "report" ? (
                <ArrowUpRight className="size-3.5 mt-1 text-ink-faint group-hover:text-ink" aria-hidden />
              ) : (
                <ExternalLink className="size-3.5 mt-1 text-ink-faint group-hover:text-ink" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

const POLL_MS = 4000;

/**
 * A change request's result: the report regenerated as a new research. Shows Pramaan thinking while it runs
 * (live), then the revised report in full right here. The original report above is never modified.
 */
export function RevisionCard({ revisionId, instructions, since }: { revisionId: string; instructions: string; since: string }) {
  const toast = useToast();
  const { data: revision, loading, refresh } = useResource(
    () => services.research.get(revisionId),
    [revisionId],
    () => services.research.peek(revisionId),
  );
  const refreshRef = useRef(refresh);
  useLayoutEffect(() => {
    refreshRef.current = refresh;
  });
  const status = revision?.status;
  const ready = status === "complete" && Boolean(revision?.report);

  // Follow the revision's job: live progress stream, plus a poll so completion always lands.
  useEffect(() => {
    if (!status || ready || status === "failed" || status === "timeout" || status === "no_sources") return;
    const stop = services.research.stream(revisionId, (e) => {
      if (e.status !== "running") void refreshRef.current();
    });
    const poll = setInterval(() => void refreshRef.current(), POLL_MS);
    return () => {
      stop();
      clearInterval(poll);
    };
  }, [revisionId, status, ready]);

  if (loading) return <Skeleton className="mt-5 h-24 rounded-xl" />;
  if (!revision)
    return <p className="mt-5 rounded-xl border border-line bg-surface p-4 text-[13.5px] text-ink-muted">This revised report has been deleted.</p>;

  if (status === "failed" || status === "timeout" || status === "no_sources") {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
        <p className="flex-1 min-w-[200px] text-[13.5px] text-ink-2">Pramaan couldn&rsquo;t finish the revised report. The original report is unchanged.</p>
        <Button
          size="sm"
          variant="secondary"
          leading={<RotateCcw className="size-3.5" />}
          onClick={async () => {
            try {
              await services.research.retry(revisionId);
              await refresh();
            } catch (e) {
              toast({ title: "Couldn't retry", description: e instanceof Error ? e.message : "Please try again.", tone: "error" });
            }
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mt-5 rounded-xl border border-line bg-surface p-4 sm:p-5" aria-busy="true">
        <ThinkingIndicator since={revision.createdAt ?? since} startAt={3} />
        <p className="mt-2 pl-11 text-[13px] text-ink-muted">
          Regenerating the report with your changes — researching again and re-checking every claim. Your original report stays exactly as it is.
        </p>
        <p className="mt-3 ml-11 inline-flex max-w-full items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-[12.5px] text-ink-2">
          <Sparkles className="size-3.5 mt-0.5 shrink-0 text-sage-ink" aria-hidden />
          <span className="min-w-0 break-words">{revision.revisionInstructions || instructions}</span>
        </p>
        <span className="sr-only" role="status">
          Regenerating the report.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-sage-deep/40 bg-raised/60 p-4 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3" data-print-hide>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-2.5 py-1 text-[12px] font-medium text-sage-ink">
          <Sparkles className="size-3.5" aria-hidden /> Revised report
        </span>
        <ButtonLink href={`/research/${revision.id}`} size="sm" variant="ghost" trailing={<ArrowUpRight className="size-3.5" />}>
          Open as its own page
        </ButtonLink>
      </div>
      <ResearchProvider research={revision}>
        <div className="mt-4">
          <ResearchReport embedded />
        </div>
        <SourceDrawer />
      </ResearchProvider>
    </div>
  );
}
