"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useSyncExternalStore } from "react";
import { PramaanMark } from "@/components/brand/PramaanMark";
import { PramaanWordmark } from "@/components/brand/PramaanWordmark";
import type { Project, Research, ResearchProgressEvent } from "@/types";

interface Props {
  research: Research;
  /** Live job state; used by the parent to decide when this screen shows. Nothing technical is displayed. */
  event: ResearchProgressEvent;
  project?: Project | null;
  /** True once the job has completed, just before the parent transitions to the results page. */
  resolving?: boolean;
}

const EASE = [0.22, 1, 0.36, 1] as const; // slow, soft ease-out
const RING = 46; // ring radius in the 100×100 viewBox
const noopSubscribe = () => () => {};

/**
 * The post-prompt loading screen: a calm, brand-focused moment while research runs.
 * Shows only the Pramaan logo with a sage stroke, the name, the tagline, two lines of
 * copy and an indeterminate hairline indicator — no steps, sources or percentages.
 * Colours are theme tokens (light: #FAF8ED / #E5E2CE / #CBD6CA family / #191A17).
 */
export function ResearchProgressView({ research, resolving = false }: Props) {
  // Read the motion preference only after hydration so server and client renders match.
  const prefersReduced = useReducedMotion() ?? false;
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const reduce = hydrated && prefersReduced;
  const live = !reduce && !resolving;

  const fade = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1.1, delay, ease: EASE } };

  return (
    <div className="min-h-[calc(100dvh-7rem)] grid place-items-center bg-bg px-6 py-16" aria-busy={!resolving}>
      <h1 className="sr-only">{research.query}</h1>
      <p className="sr-only" role="status" aria-live="polite">
        {resolving ? "Your research is ready." : "Your research is being prepared."}
      </p>

      <div className="flex flex-col items-center text-center">
        {/* Logo with a delicate sage stroke */}
        <motion.div className="relative grid place-items-center size-[124px] sm:size-[148px]" {...fade(0)}>
          <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <motion.circle
              cx="50"
              cy="50"
              r={RING}
              fill="none"
              stroke="var(--line)"
              strokeWidth={0.75}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={reduce ? { duration: 0 } : { duration: 2.4, delay: 0.2, ease: EASE }}
              transform="rotate(-90 50 50)"
            />
            <motion.g
              style={{ transformOrigin: "50px 50px" }}
              initial={false}
              animate={live ? { rotate: 360 } : { rotate: 0 }}
              transition={live ? { duration: 9, ease: "linear", repeat: Infinity } : { duration: 0.8, ease: EASE }}
            >
              <motion.circle
                cx="50"
                cy="50"
                r={RING}
                fill="none"
                stroke="var(--sage-deep)"
                strokeWidth={1.5}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={resolving || reduce ? { pathLength: 1, opacity: 1 } : { pathLength: 0.28, opacity: 1 }}
                transition={{ duration: reduce ? 0 : resolving ? 1.2 : 1.6, delay: resolving || reduce ? 0 : 0.6, ease: EASE }}
              />
            </motion.g>
          </svg>
          <PramaanMark size={68} className="size-14 sm:size-[68px]" title="Pramaan AI" />
        </motion.div>

        {/* Name + tagline (existing brand wordmark) */}
        <motion.div className="mt-6 sm:mt-7" {...fade(0.45)}>
          <PramaanWordmark size="md" tagline className="items-center" />
        </motion.div>

        {/* Copy */}
        <motion.p className="mt-10 sm:mt-12 font-display text-[28px] sm:text-[36px] leading-[1.1] text-ink text-balance" {...fade(0.85)}>
          Turning questions into clarity.
        </motion.p>
        <motion.p className="mt-3 text-[14px] sm:text-[15px] text-ink-muted" {...fade(1.05)}>
          Your research is being prepared.
        </motion.p>

        {/* Indeterminate hairline indicator — no invented percentages */}
        <motion.div className="mt-8 h-[1.5px] w-40 sm:w-48 overflow-hidden rounded-full bg-line" aria-hidden {...fade(1.25)}>
          {reduce ? (
            <div className="h-full w-full bg-sage" />
          ) : (
            <motion.div
              className="h-full rounded-full bg-sage-deep"
              initial={false}
              animate={resolving ? { x: "0%", width: "100%" } : { x: ["-100%", "250%"], width: "40%" }}
              transition={resolving ? { duration: 0.9, ease: EASE } : { duration: 3.2, ease: [0.65, 0, 0.35, 1], repeat: Infinity, repeatDelay: 0.4 }}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
