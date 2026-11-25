import { motion } from "framer-motion";
import { MODES } from "@/components/research/research-options";
import type { Project, Research, ResearchProgressEvent } from "@/types";
import { THINKING_WORDS, ThinkingIndicator, useHydratedReducedMotion } from "./Thinking";

export { THINKING_WORDS };

const EASE = [0.22, 1, 0.36, 1] as const;

interface Props {
  research: Research;
  /** Live job state; used by the parent to decide when this screen shows. Nothing technical is displayed. */
  event: ResearchProgressEvent;
  project?: Project | null;
  /** True once the job has completed, just before the parent transitions to the report. */
  resolving?: boolean;
}

/**
 * The research loading screen, shaped like a chat: the question as the user's message, and
 * Pramaan "thinking" beneath it — an animated mark and a rotating word with a soft shimmer.
 */
export function ResearchProgressView({ research, project, resolving = false }: Props) {
  const { reduce } = useHydratedReducedMotion();
  const mode = MODES.find((m) => m.value === research.mode)?.label ?? "Research";

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
        className="mt-8"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.25, ease: EASE }}
      >
        <ThinkingIndicator since={research.createdAt} done={resolving} doneLabel="Report ready" />
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
