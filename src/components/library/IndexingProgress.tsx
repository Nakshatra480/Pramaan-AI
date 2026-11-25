import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { INDEXING_STAGES } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import type { IndexingStage } from "@/types";

/** Uploading → Extracting → Chunking → Generating embeddings → Indexing → Ready (PRD §38). */
export function IndexingProgress({ stage, compact }: { stage: IndexingStage; compact?: boolean }) {
  if (stage === "failed")
    return (
      <p className="inline-flex items-center gap-1.5 text-[12px] text-danger">
        <AlertCircle className="size-3.5" /> Processing failed
      </p>
    );
  const idx = INDEXING_STAGES.findIndex((s) => s.id === stage);
  const label = INDEXING_STAGES[idx]?.label ?? "Ready";
  return (
    <div className="w-full" role="status" aria-label={`Indexing: ${label}`}>
      <div className="flex gap-1" aria-hidden>
        {INDEXING_STAGES.slice(0, -1).map((s, i) => (
          <span key={s.id} className="relative h-1 flex-1 rounded-full bg-muted overflow-hidden">
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full bg-accent"
              initial={false}
              animate={{ width: i < idx ? "100%" : i === idx ? "55%" : "0%" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
        ))}
      </div>
      {!compact && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className={cn("size-1.5 rounded-full", stage === "ready" ? "bg-accent" : "bg-accent animate-pulse-soft")} />
          {label}
          {stage !== "ready" && "…"}
        </p>
      )}
    </div>
  );
}
