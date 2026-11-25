import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

/** Drawn circle + check. Used for save confirmation, verified claims and completion. */
export function VerificationMark({ size = 20, className, delay = 0, tone = "sage" }: { size?: number; className?: string; delay?: number; tone?: "sage" | "ink" | "bg" }) {
  const stroke = tone === "ink" ? "var(--ink)" : tone === "bg" ? "var(--bg)" : "var(--accent)";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden>
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.45, delay, ease: [0.65, 0, 0.35, 1] }}
      />
      <motion.path
        d="M7.5 12.3l3 3 6-6.3"
        fill="none"
        stroke={stroke}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: delay + 0.32, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
