import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { PramaanMark } from "@/components/brand/PramaanMark";
import { cn } from "@/lib/utils/cn";

/**
 * The Pramaan signature animation (PRD §27).
 *
 * A central point; evidence nodes appear progressively around it; thin lines
 * connect them; the active node pulses; verified nodes become checkmarks; on
 * completion the network resolves into the Pramaan mark.
 *
 * Driven by `progress` (0–1) and `verified` (0–1). With `autoplay`, it loops
 * on its own for indeterminate work (document indexing, route loading).
 * Rendering is SVG + transforms only; the only loop is a coarse timer.
 */

interface Props {
  progress?: number;
  verified?: number;
  complete?: boolean;
  autoplay?: boolean;
  size?: number;
  className?: string;
  label?: string;
}

const NODE_COUNT = 10;

function layout(count: number) {
  // Deterministic, slightly irregular placement on two rings — reads as "found", not "generated".
  const nodes: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const ring = i % 2 === 0 ? 76 : 50;
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2 + (i % 3) * 0.14;
    nodes.push({ x: 120 + Math.cos(angle) * ring, y: 120 + Math.sin(angle) * ring, r: i % 2 === 0 ? 5 : 4 });
  }
  return nodes;
}

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0], [1, 5], [3, 7], [0, 6],
];

export function PramaanResearchAnimation({ progress = 0, verified = 0, complete = false, autoplay = false, size = 240, className, label = "Pramaan is researching" }: Props) {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!autoplay || reduce) return;
    const t = setInterval(() => setTick((x) => (x + 1) % 16), 520);
    return () => clearInterval(t);
  }, [autoplay, reduce]);

  const p = autoplay ? (reduce ? 0.8 : Math.min(1, tick / 11)) : progress;
  const v = autoplay ? (reduce ? 0.6 : Math.max(0, (tick - 6) / 6)) : verified;
  const done = complete || (autoplay && !reduce && tick >= 13);

  const nodes = useMemo(() => layout(NODE_COUNT), []);
  const shown = Math.max(1, Math.ceil(p * NODE_COUNT));
  const verifiedCount = Math.floor(Math.min(1, v) * shown);
  const activeIndex = done ? -1 : shown - 1;

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }} role="img" aria-label={done ? "Research verified" : label}>
      <svg viewBox="0 0 240 240" className="absolute inset-0 size-full overflow-visible">
        {/* Guide rings, from the brand construction lines */}
        <circle cx="120" cy="120" r="104" fill="none" stroke="var(--line-strong)" strokeDasharray="1.5 5" opacity={0.7} />
        <motion.circle
          cx="120"
          cy="120"
          r="76"
          fill="none"
          stroke="var(--line)"
          animate={{ opacity: done ? 0 : 1 }}
          transition={{ duration: 0.5 }}
        />
        <line x1="120" y1="4" x2="120" y2="236" stroke="var(--line)" strokeDasharray="1.5 5" />
        <line x1="4" y1="120" x2="236" y2="120" stroke="var(--line)" strokeDasharray="1.5 5" />

        {/* Edges */}
        <AnimatePresence>
          {!done &&
            EDGES.filter(([a, b]) => a < shown && b < shown).map(([a, b]) => (
              <motion.line
                key={`${a}-${b}`}
                x1={nodes[a].x}
                y1={nodes[a].y}
                x2={nodes[b].x}
                y2={nodes[b].y}
                stroke="var(--sage-deep)"
                strokeWidth="1"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.9 }}
                exit={{ opacity: 0, transition: { duration: 0.3 } }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          {!done &&
            nodes.slice(0, shown).map((n, i) => (
              <motion.line
                key={`c-${i}`}
                x1={120}
                y1={120}
                x2={n.x}
                y2={n.y}
                stroke="var(--line-strong)"
                strokeWidth="0.75"
                strokeDasharray="2 3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.4 }}
              />
            ))}
        </AnimatePresence>

        {/* Nodes */}
        {nodes.slice(0, shown).map((n, i) => {
          const isVerified = i < verifiedCount;
          return (
            <motion.g
              key={i}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={done ? { opacity: 0, scale: 0.3, x: (120 - n.x) * 0.85, y: (120 - n.y) * 0.85 } : { opacity: 1, scale: 1, x: 0, y: 0 }}
              transition={done ? { duration: 0.55, delay: i * 0.025, ease: [0.65, 0, 0.35, 1] } : { type: "spring", stiffness: 300, damping: 22 }}
              style={{ originX: `${n.x}px`, originY: `${n.y}px` }}
            >
              {i === activeIndex && <circle cx={n.x} cy={n.y} r={n.r + 6} fill="var(--sage)" className="animate-pulse-soft" style={{ transformOrigin: `${n.x}px ${n.y}px` }} />}
              <circle cx={n.x} cy={n.y} r={isVerified ? n.r + 2.5 : n.r} fill={isVerified ? "var(--accent)" : i === activeIndex ? "var(--accent)" : "var(--surface)"} stroke={isVerified ? "none" : "var(--ink-muted)"} strokeWidth="1.1" style={{ transition: "r 300ms, fill 300ms" }} />
              {isVerified && (
                <motion.path
                  d={`M${n.x - 3} ${n.y + 0.2}l2.1 2.1 4-4.3`}
                  fill="none"
                  stroke="var(--bg)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3 }}
                />
              )}
            </motion.g>
          );
        })}

        {/* Core */}
        <motion.circle cx="120" cy="120" fill="var(--ink)" initial={{ r: 4.5 }} animate={{ r: done ? 0 : 4.5 }} transition={{ duration: 0.4 }} />
        <motion.circle
          cx="120"
          cy="120"
          r="34"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.2"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={{ duration: 0.7, delay: done ? 0.35 : 0, ease: [0.65, 0, 0.35, 1] }}
          style={{ rotate: -90, originX: "120px", originY: "120px" }}
        />
      </svg>

      <AnimatePresence>
        {done && (
          <motion.div
            className="absolute inset-0 grid place-items-center"
            initial={{ opacity: 0, scale: 0.7, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.45 }}
          >
            <PramaanMark size={size * 0.2} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
