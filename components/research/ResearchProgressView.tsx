"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PramaanMark } from "@/components/brand/PramaanMark";
import { MODES } from "@/components/research/research-options";
import type { Project, Research, ResearchProgressEvent } from "@/types";

interface Props {
  research: Research;
  /** Live job state; used by the parent to decide when this screen shows. Nothing technical is displayed. */
  event: ResearchProgressEvent;
  project?: Project | null;
  /** True once the job has completed, just before the parent transitions to the report. */
  resolving?: boolean;
}

/** Playful "thinking" verbs, rotated while research runs. Purely decorative — they don't describe real steps. */
export const THINKING_WORDS = [
  "Mulling",
  "Sifting",
  "Pondering",
  "Cross-checking",
  "Manifesting",
  "Weighing evidence",
  "Untangling",
  "Corroborating",
  "Ruminating",
  "Triangulating",
  "Distilling",
  "Unearthing",
  "Deliberating",
  "Piecing it together",
  "Percolating",
  "Fact-finding",
  "Contemplating",
  "Synthesising",
] as const;

const WORD_MS = 2600;
const EASE = [0.22, 1, 0.36, 1] as const;
const noopSubscribe = () => () => {};

function useElapsed(since: string, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/**
 * The research loading screen, shaped like a chat: the question as the user's message, and
 * Pramaan "thinking" beneath it — an animated mark and a rotating word with a soft shimmer.
 */
export function ResearchProgressView({ research, project, resolving = false }: Props) {
  // Read the motion preference only after hydration so server and client renders match.
  const prefersReduced = useReducedMotion() ?? false;
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const reduce = hydrated && prefersReduced;
  const live = !resolving;

  const [i, setI] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setI((n) => (n + 1) % THINKING_WORDS.length), WORD_MS);
    return () => clearInterval(t);
  }, [live]);
  const elapsed = useElapsed(research.createdAt, live && hydrated);
  const mode = MODES.find((m) => m.value === research.mode)?.label ?? "Research";
  const word = THINKING_WORDS[i];

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6 pt-10 sm:pt-14 pb-24 min-h-[calc(100dvh-7rem)]" aria-busy={!resolving}>
      <h1 className="sr-only">{research.query}</h1>
      <p className="sr-only" role="status" aria-live="polite">
        {resolving ? "Your research is ready." : "Pramaan is researching your question."}
      </p>

      {/* The question, as the user's message */}
      <motion.div
        className="flex justify-end"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-subtle border border-line px-4 py-3 text-[15px] leading-relaxed text-ink whitespace-pre-wrap break-words">
          {research.query}
        </div>
      </motion.div>
      <motion.p
        className="mt-2 text-right text-[12px] text-ink-faint"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        {mode}
        {project ? ` · ${project.name}` : ""}
      </motion.p>

      {/* Pramaan thinking */}
      <motion.div
        className="mt-8 flex items-center gap-3"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.25, ease: EASE }}
        aria-hidden
      >
        <span className="relative grid place-items-center size-8 shrink-0">
          {!reduce && live && (
            <motion.span
              className="absolute inset-0 rounded-full border-[1.5px] border-transparent border-t-sage-ink border-r-sage-ink/40"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.6, ease: "linear", repeat: Infinity }}
            />
          )}
          <motion.span
            animate={!reduce && live ? { scale: [1, 0.9, 1] } : { scale: 1 }}
            transition={!reduce && live ? { duration: 2.2, ease: "easeInOut", repeat: Infinity } : { duration: 0.3 }}
          >
            <PramaanMark size={20} sparkle={false} />
          </motion.span>
        </span>

        <span className="relative h-6 flex items-center min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {resolving ? (
              <motion.span
                key="done"
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-sage-ink"
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Check className="size-4" /> Report ready
              </motion.span>
            ) : (
              <motion.span
                key={word}
                className={reduce ? "text-[15px] font-medium text-ink-muted" : "thinking-shimmer text-[15px] font-medium"}
                initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, filter: "blur(3px)" }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                {word}…
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        {hydrated && !resolving && <span className="ml-1 text-[12.5px] tabular text-ink-faint">{elapsed}</span>}
      </motion.div>

      <motion.p
        className="mt-3 pl-11 text-[13px] text-ink-muted"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
      >
        {resolving ? "Opening your report." : "Reading sources and checking every claim against its evidence. This usually takes a minute or two."}
      </motion.p>
    </div>
  );
}
