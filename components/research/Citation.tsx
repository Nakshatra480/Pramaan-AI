"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useRef, useState } from "react";
import { Portal } from "@/components/ui/Portal";
import { useAnchoredPosition } from "@/components/ui/Popover";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { citationLabel } from "@/lib/utils/citations";
import { cn } from "@/lib/utils/cn";
import { useResearch } from "./ResearchContext";
import { RelevanceMeter, SourceFavicon, SourceMetaLine } from "./SourceMeta";

/**
 * Inline citation marker — `[n]`, or an author–date label in the user's citation style.
 * Hover/focus → source preview; click → source drawer.
 * The marker is a real button, so it is reachable and announced for keyboard/SR users.
 */
export function Citation({ index }: { index: number }) {
  const { sourceByIndex, openSource, activeSourceId, research } = useResearch();
  const { prefs } = usePreferences();
  const source = sourceByIndex(index);
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { setAnchor, floatRef, pos } = useAnchoredPosition(hover, "top", 8);

  if (!source) return <sup className="text-ink-faint">[{index}]</sup>;
  const evidence = research.evidence.find((e) => e.sourceId === source.id);
  const active = activeSourceId === source.id;
  const numeric = prefs.citationStyle === "numeric";

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(true), 180);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(false), 120);
  };

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => {
          setHover(false);
          openSource(source.id);
        }}
        aria-label={`Source ${index}: ${source.title}`}
        className={cn(
          numeric
            ? "relative -top-[0.3em] mx-[1px] inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-[5px] text-[10.5px] font-semibold font-sans tabular leading-none align-baseline"
            : "mx-[1px] inline rounded-[4px] px-1 py-px font-sans text-[0.82em] font-medium leading-normal align-baseline",
          "touch-target transition-[background-color,color,transform] duration-150 hover:-translate-y-px",
          active ? "bg-ink text-bg" : "bg-sage-soft text-sage-ink hover:bg-sage",
        )}
      >
        {numeric ? index : `(${citationLabel(source, prefs.citationStyle, index)})`}
      </button>
      <Portal>
        <AnimatePresence>
          {hover && (
            <motion.div
              ref={floatRef}
              onMouseEnter={show}
              onMouseLeave={hide}
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
              className="z-[var(--z-popover)] w-[min(340px,calc(100vw-24px))] rounded-xl border border-line bg-raised shadow-lg p-4"
              role="tooltip"
            >
              <div className="flex items-start gap-3">
                <SourceFavicon source={source} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium leading-snug text-ink line-clamp-2">{source.title}</p>
                  <SourceMetaLine source={source} className="mt-1" />
                </div>
              </div>
              {evidence && (
                <blockquote className="mt-3 border-l-2 border-sage-deep pl-3 font-display text-[15.5px] leading-snug text-ink-2 line-clamp-4">
                  “{evidence.passage}”
                </blockquote>
              )}
              <div className="mt-3 flex items-center justify-between text-[12px] text-ink-faint">
                <span className="inline-flex items-center gap-2">
                  Relevance <RelevanceMeter value={source.relevance} />
                </span>
                <span className="inline-flex items-center gap-1 text-ink-muted">
                  Click for evidence <ArrowUpRight className="size-3" />
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
