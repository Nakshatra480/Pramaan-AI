"use client";

import { AlertTriangle, Clock, SearchX, ServerCrash } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { services } from "@/lib/services";
import type { Research } from "@/types";

/** Research-engine (local Ollama) and restart failures — all retryable; the question is kept. */
const MODEL_COPY: Record<string, { icon: typeof ServerCrash; title: string; body: string; primary: string }> = {
  MODEL_UNAVAILABLE: {
    icon: ServerCrash,
    title: "Pramaan's research engine is offline right now.",
    body: "Your question is saved. Nothing unverified was written. Retry when the research engine is back online.",
    primary: "Retry",
  },
  MODEL_TIMEOUT: {
    icon: Clock,
    title: "The research engine took too long to respond.",
    body: "It may be busy or still loading its model. Your question is saved — retry in a moment.",
    primary: "Retry",
  },
  MODEL_NOT_INSTALLED: {
    icon: AlertTriangle,
    title: "The research engine is missing a required model.",
    body: "No research was run. Retry once the model has been installed on the research engine.",
    primary: "Retry",
  },
  MODEL_OUT_OF_MEMORY: {
    icon: AlertTriangle,
    title: "The research engine ran out of memory.",
    body: "This usually clears up once other work finishes. Your question is saved — retry shortly.",
    primary: "Retry",
  },
  INTERRUPTED: {
    icon: Clock,
    title: "Research was interrupted before it could finish.",
    body: "The server restarted during this research more than once. Your question is saved — retry to run it again.",
    primary: "Retry",
  },
};

const COPY = {
  failed: {
    icon: ServerCrash,
    title: "Pramaan couldn't complete this research.",
    body: "A research provider stopped responding while evidence was being collected. Nothing unverified has been presented as a finding.",
    primary: "Retry",
  },
  timeout: {
    icon: Clock,
    title: "Research took longer than expected.",
    body: "Deep Research reached its time limit before every claim could be verified. You can continue where it stopped.",
    primary: "Continue research",
  },
  no_sources: {
    icon: SearchX,
    title: "Pramaan couldn't find enough relevant sources.",
    body: "There isn't enough published evidence to answer this reliably. Try broadening the question, adding Academic sources, or uploading documents to your library.",
    primary: "Try again",
  },
} as const;

/** Research failure / timeout / no-sources states (PRD §48). */
export function ResearchErrorState({ research }: { research: Research }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const copy = (research.errorCode && MODEL_COPY[research.errorCode]) || COPY[research.status as keyof typeof COPY] || COPY.failed;
  const Icon = copy.icon;

  return (
    <div className="mx-auto max-w-[720px] px-4 sm:px-6 py-14 sm:py-20">
      <p className="eyebrow mb-4">Research</p>
      <h1 className="font-display text-[34px] sm:text-[42px] leading-[1.08] text-ink text-balance">{research.query}</h1>

      <div className="mt-10 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <span className="grid place-items-center size-11 rounded-xl bg-warn-soft text-warn mb-5">
          <Icon className="size-5" />
        </span>
        <h2 className="text-[19px] font-semibold text-ink">{copy.title}</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">{copy.body}</p>

        <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
          {[
            ["Sources reviewed", research.metrics.sources],
            ["Passages collected", research.metrics.evidence],
            ["Claims verified", research.metrics.verifiedClaims],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dd className="font-display text-[30px] leading-none text-ink tabular">{v}</dd>
              <dt className="mt-1.5 text-[12px] text-ink-muted">{k}</dt>
            </div>
          ))}
        </dl>

        <div className="mt-7 flex flex-wrap gap-2">
          <Button
            loading={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                await services.research.retry(research.id);
              } catch {
                setRetrying(false);
              }
            }}
          >
            {copy.primary}
          </Button>
          {research.metrics.evidence > 0 && (
            <Button variant="secondary" onClick={() => setEvidenceOpen(true)}>
              View collected evidence
            </Button>
          )}
          <ButtonLink href={`/research/new?q=${encodeURIComponent(research.query)}`} variant="ghost">
            Edit question
          </ButtonLink>
        </div>
      </div>

      <Dialog open={evidenceOpen} onClose={() => setEvidenceOpen(false)} title="Collected evidence" description="Partial results gathered before the research stopped.">
        <div className="flex gap-3 rounded-xl bg-warn-soft/60 border border-line p-4 text-[13px] text-ink-2">
          <AlertTriangle className="size-4 mt-0.5 text-warn shrink-0" />
          <p>
            {research.metrics.evidence} passages from {research.metrics.sources} sources were collected, but only {research.metrics.verifiedClaims} claims finished verification. Unverified evidence is kept for reference and is not presented as a conclusion.
          </p>
        </div>
        <ul className="mt-4 space-y-2 text-[13.5px] text-ink-2">
          {(research.sources ?? services.sources.all())
            .filter((s) => s.type !== "library")
            .slice(0, Math.min(5, research.metrics.sources))
            .map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                <span className="truncate">{s.publisher}</span>
                <span className="text-[12px] text-ink-faint">Not verified</span>
              </li>
            ))}
        </ul>
      </Dialog>
    </div>
  );
}
