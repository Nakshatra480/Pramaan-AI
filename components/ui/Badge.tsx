import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "sage" | "outline" | "warn" | "danger" | "ink";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-subtle text-ink-muted",
  sage: "bg-sage-soft text-sage-ink",
  outline: "border border-line text-ink-muted",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  ink: "bg-ink text-bg",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[11.5px] font-medium whitespace-nowrap", TONES[tone], className)}
      {...props}
    />
  );
}
