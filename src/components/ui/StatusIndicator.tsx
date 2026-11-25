import { AlertTriangle, Check, CircleDashed, HelpCircle, X } from "lucide-react";
import type { ClaimStatus } from "@/types";
import { cn } from "@/lib/utils/cn";

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; tone: string; dot: string }> = {
  supported: { label: "Supported", tone: "bg-sage-soft text-sage-ink", dot: "bg-accent" },
  partially_supported: { label: "Partially supported", tone: "bg-warn-soft text-warn", dot: "bg-warn" },
  unsupported: { label: "Unsupported", tone: "bg-danger-soft text-danger", dot: "bg-danger" },
  insufficient_evidence: { label: "Insufficient evidence", tone: "bg-subtle text-ink-muted", dot: "bg-ink-faint" },
};

const ICON: Record<ClaimStatus, typeof Check> = {
  supported: Check,
  partially_supported: AlertTriangle,
  unsupported: X,
  insufficient_evidence: HelpCircle,
};

export function ClaimStatusBadge({ status, className }: { status: ClaimStatus; className?: string }) {
  const s = CLAIM_STATUS[status];
  const Icon = ICON[status];
  return (
    <span className={cn("inline-flex items-center gap-1 h-[22px] pl-1.5 pr-2 rounded-full text-[11.5px] font-medium whitespace-nowrap", s.tone, className)}>
      <Icon className="size-3" aria-hidden strokeWidth={2.4} />
      {s.label}
    </span>
  );
}

type Status = "pending" | "active" | "complete" | "skipped" | "error";

/** Pending ○ → active ● → complete ✓ (PRD §53). */
export function StatusIndicator({ status, className, label }: { status: Status; className?: string; label?: string }) {
  return (
    <span className={cn("relative inline-grid place-items-center size-5 shrink-0", className)} role="img" aria-label={label ?? status}>
      {status === "complete" && (
        <span className="grid place-items-center size-5 rounded-full bg-accent text-bg">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      {status === "active" && (
        <>
          <span className="absolute size-5 rounded-full bg-sage animate-pulse-soft" />
          <span className="relative size-2 rounded-full bg-accent" />
        </>
      )}
      {status === "pending" && <span className="size-3.5 rounded-full border-[1.5px] border-line-strong" />}
      {status === "skipped" && <CircleDashed className="size-4 text-ink-faint" />}
      {status === "error" && (
        <span className="grid place-items-center size-5 rounded-full bg-danger text-white">
          <X className="size-3" strokeWidth={3} />
        </span>
      )}
    </span>
  );
}
