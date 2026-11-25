import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PramaanMark } from "@/components/brand/PramaanMark";

/** Playful "thinking" verbs, rotated while Pramaan works. Purely decorative — they don't describe real steps. */
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

export function useHydratedReducedMotion() {
  const prefersReduced = useReducedMotion() ?? false;
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return { hydrated, reduce: hydrated && prefersReduced };
}

export function useElapsed(since: string, running: boolean) {
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
 * Pramaan "thinking": the animated mark with a spinning ring, a rotating verb with a soft shimmer and,
 * optionally, a live elapsed time. `done` swaps the verb for a check and a label.
 */
export function ThinkingIndicator({ since, done = false, doneLabel = "Done", startAt = 0 }: { since?: string; done?: boolean; doneLabel?: string; startAt?: number }) {
  const { hydrated, reduce } = useHydratedReducedMotion();
  const live = !done;
  const [i, setI] = useState(startAt % THINKING_WORDS.length);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setI((n) => (n + 1) % THINKING_WORDS.length), WORD_MS);
    return () => clearInterval(t);
  }, [live]);
  const elapsed = useElapsed(since ?? new Date().toISOString(), live && hydrated && Boolean(since));
  const word = THINKING_WORDS[i];

  return (
    <div className="flex items-center gap-3" aria-hidden>
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
          {done ? (
            <motion.span
              key="done"
              className="inline-flex items-center gap-1.5 text-[15px] font-medium text-sage-ink"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Check className="size-4" /> {doneLabel}
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

      {hydrated && since && !done && <span className="ml-1 text-[12.5px] tabular text-ink-faint">{elapsed}</span>}
    </div>
  );
}
