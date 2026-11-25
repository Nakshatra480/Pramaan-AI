import { AnimatePresence, motion } from "framer-motion";
import { Layers } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { useResource } from "@/lib/hooks/use-resource";
import { track } from "@/lib/firebase/analytics";
import { services } from "@/lib/services";
import { canLeaveLoading, nextPhase, type ResearchPhase } from "@/lib/utils/research-phase";
import type { ResearchProgressEvent } from "@/types";
import { FollowUpComposer, FollowUpThread } from "./FollowUps";
import { ResearchActions } from "./ResearchActions";
import { ResearchProvider } from "./ResearchContext";
import { ResearchErrorState } from "./ResearchErrorState";
import { ResearchProgressView } from "./ResearchProgressView";
import { ResearchReport } from "./ResearchReport";
import { ResearchSkeleton } from "./ResearchSkeleton";
import { SourceDrawer } from "./SourceDrawer";
import { SourcePanel } from "./SourcePanel";

/** Minimum time the loading screen's closing moment stays up once research has finished. */
const MIN_RESOLVE_MS = 1200;
/** How often to refetch the session while waiting for the finished result to arrive. */
const RESOLVE_POLL_MS = 2500;

/**
 * Orchestrates a research session: loading screen → closing moment → report.
 * The phase follows the real job state (see lib/utils/research-phase.ts): the results replace the
 * loading screen only once the fetched session is itself finished, so a slow refetch can never
 * strand the page on the loading screen.
 */
export function ResearchView({ researchId, initialSourceId }: { researchId: string; initialSourceId?: string | null }) {
  const { data: research, loading, refresh } = useResource(() => services.research.get(researchId), [researchId]);
  const { data: project } = useResource(async () => (research?.projectId ? services.projects.get(research.projectId) : null), [research?.projectId]);
  const [event, setEvent] = useState<ResearchProgressEvent | null>(null);
  const [phase, setPhase] = useState<ResearchPhase | null>(null);
  const [completeSignal, setCompleteSignal] = useState(false);
  const resolvingSince = useRef(0);
  const refreshRef = useRef(refresh);
  useLayoutEffect(() => {
    refreshRef.current = refresh;
  });
  const status = research?.status;
  const hasReport = Boolean(research?.report);

  // Follow the job state: initial phase, completion, and genuine retries.
  useEffect(() => {
    const next = nextPhase(phase, status, completeSignal);
    if (next === phase) return;
    if (next === "resolving") resolvingSince.current = Date.now();
    // Phase follows external job state (the session refetch and the live stream).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase(next);
    if (phase === "report" && next === "progress") setCompleteSignal(false); // retried: wait for a new completion
  }, [phase, status, completeSignal]);

  // Closing moment: show results once the fetched session is finished; until then keep refetching.
  useEffect(() => {
    if (phase !== "resolving") return;
    if (canLeaveLoading(status, hasReport)) {
      const wait = Math.max(0, MIN_RESOLVE_MS - (Date.now() - resolvingSince.current));
      const t = setTimeout(() => setPhase("report"), wait);
      return () => clearTimeout(t);
    }
    void refreshRef.current();
    const poll = setInterval(() => void refreshRef.current(), RESOLVE_POLL_MS);
    return () => clearInterval(poll);
  }, [phase, status, hasReport]);

  useEffect(() => {
    if (status !== "running") return;
    return services.research.stream(researchId, (e) => {
      setEvent(e);
      if (e.status === "complete") {
        void track("research_completed");
        setCompleteSignal(true);
      }
    });
  }, [researchId, status]);

  if (loading) return <ResearchSkeleton />;
  if (!research)
    return (
      <EmptyState
        title="Research not found"
        description="It may have been deleted, or the link is incorrect."
        action={<ButtonLink href="/history">Open history</ButtonLink>}
      />
    );
  if (!phase) return <ResearchSkeleton />;

  const liveEvent = event ?? services.research.snapshot(research);

  return (
    <AnimatePresence mode="wait">
      {phase !== "report" || !research.report ? (
        research.status === "failed" || research.status === "timeout" || research.status === "no_sources" ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ResearchErrorState research={research} />
          </motion.div>
        ) : (
          <motion.div key="progress" exit={{ opacity: 0, scale: 0.985, filter: "blur(4px)", transition: { duration: 0.45 } }}>
            <ResearchProgressView research={research} event={liveEvent} project={project} resolving={phase === "resolving"} />
          </motion.div>
        )
      ) : (
        <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          <ResearchProvider research={research} initialSourceId={initialSourceId}>
            <ReportLayout project={project ?? null} />
          </ResearchProvider>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ReportLayout({ project }: { project: Parameters<typeof ResearchReport>[0]["project"] }) {
  const followRef = useRef<HTMLTextAreaElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isDesktop = useIsDesktop();

  const focusFollowUp = () => {
    followRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => followRef.current?.focus({ preventScroll: true }), 350);
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-10 py-8 sm:py-12">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <ResearchReport project={project} actions={<ResearchActions onFollowUp={focusFollowUp} />} />
          <FollowUpThread />
          <FollowUpComposer ref={followRef} />
        </div>
        <aside className="hidden lg:block" aria-label="Sources">
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto thin-scrollbar pr-1 -mr-1">
            <SourcePanel />
          </div>
        </aside>
      </div>

      {/* Tablet & mobile: collapsible source panel as a sheet */}
      <div className="lg:hidden fixed bottom-5 inset-x-0 z-[var(--z-sticky)] flex justify-center pointer-events-none" data-print-hide>
        <motion.button
          type="button"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 24 }}
          onClick={() => setSheetOpen(true)}
          className="pointer-events-auto inline-flex items-center gap-2 h-11 px-4 rounded-full bg-ink text-bg text-[13.5px] font-medium shadow-lg active:scale-95"
        >
          <Layers className="size-4" /> Sources
        </motion.button>
      </div>
      {!isDesktop && (
        <Drawer open={sheetOpen} onClose={() => setSheetOpen(false)} side="bottom" title="Sources">
          <div className="px-4 pb-6">
            <SourcePanel onSelect={() => setSheetOpen(false)} />
          </div>
        </Drawer>
      )}
      <SourceDrawer />
    </div>
  );
}
