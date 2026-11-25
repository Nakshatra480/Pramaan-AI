import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils/cn";
import type { VoiceState } from "@/lib/speech/recognition";

interface Props {
  state: VoiceState;
  onClick: () => void;
  disabled?: boolean;
  size?: "default" | "hero";
}

/** Mic button for dictating a question. Pulses while listening; click again to stop. */
export function VoiceInputButton({ state, onClick, disabled, size = "default" }: Props) {
  const listening = state === "listening" || state === "starting";
  const busy = state === "transcribing";
  const label = busy ? "Transcribing your question" : listening ? "Stop voice input" : "Ask with your voice";
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-label={label}
        aria-pressed={listening}
        className={cn(
          "relative inline-grid place-items-center shrink-0 rounded-xl transition-colors disabled:opacity-40",
          size === "hero" ? "size-10" : "size-9",
          listening ? "bg-sage-soft text-sage-ink" : "text-ink-muted hover:text-ink hover:bg-subtle",
        )}
      >
        <AnimatePresence>
          {listening && (
            <motion.span
              key="pulse"
              aria-hidden
              className="absolute inset-0 rounded-xl border-2 border-sage-ink/40"
              initial={{ opacity: 0.8, scale: 1 }}
              animate={{ opacity: 0, scale: 1.35 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
        {busy ? <Spinner className="size-4" /> : listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-[18px]" />}
      </button>
    </Tooltip>
  );
}
