import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUp, CornerDownRight, RotateCcw } from "lucide-react";
import { forwardRef, useEffect, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import { pendingFollowUps, visiblePending } from "@/lib/utils/pending-follow-ups";
import type { FollowUp } from "@/types";
import { useResearch } from "./ResearchContext";
import { FollowUpAnswer, RevisionCard } from "./FollowUpResults";
import { ThinkingIndicator } from "./Thinking";

/** A mix of both kinds of follow-up: questions (answered with fresh search) and changes (a regenerated report). */
const SUGGESTIONS = ["What are the strongest counter-arguments?", "What has changed most recently?", "Make the report shorter and simpler", "Rewrite it for a non-specialist"];

/**
 * Ask a follow-up with instant feedback: the question and its loading card appear immediately, before
 * the request and the research reload finish. Resolves false (and removes the card) if it couldn't be sent.
 */
function useAskFollowUp(researchId: string) {
  const toast = useToast();
  return async (question: string): Promise<boolean> => {
    const key = pendingFollowUps.add(researchId, question);
    requestAnimationFrame(() => document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    try {
      pendingFollowUps.accept(key, await services.research.followUp(researchId, question));
      return true;
    } catch (e) {
      pendingFollowUps.remove(key);
      toast({ title: "Couldn't ask that follow-up", description: e instanceof Error ? e.message : "Please try again.", tone: "error" });
      return false;
    }
  };
}

/** Loaded follow-ups plus the ones just asked (shown as running until the server's copy loads). */
function useThread(): { thread: (FollowUp & { domId: string })[]; busy: boolean } {
  const { research } = useResearch();
  const all = useSyncExternalStore(pendingFollowUps.subscribe, pendingFollowUps.snapshot, pendingFollowUps.snapshot);
  const loadedIds = research.followUps.map((f) => f.id);
  const loadedKey = loadedIds.join(",");
  useEffect(() => pendingFollowUps.settle(loadedKey ? loadedKey.split(",") : []), [loadedKey]);
  const pending = visiblePending(all, research.id, loadedIds);
  const thread = [
    ...research.followUps.map((f) => ({ ...f, domId: `follow-up-${f.id}` })),
    ...pending.map((p) => ({ id: p.key, domId: p.key, question: p.question, createdAt: p.createdAt, status: "running" as const, answer: [] })),
  ];
  return { thread, busy: thread.some((f) => f.status === "running") };
}

export function FollowUpThread() {
  const { research, readOnly } = useResearch();
  const { thread, busy: running } = useThread();
  const ask = useAskFollowUp(research.id);
  if (!thread.length) return null;
  const askAgain = (question: string) => void ask(question);
  return (
    <section aria-label="Follow-up research" className="mt-16 max-w-[720px] space-y-10">
      {thread.map((f) => (
        <motion.div key={f.id} id={f.domId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="border-t border-line pt-8">
          <div className="flex items-start gap-3">
            <CornerDownRight className="size-4 mt-2 text-ink-faint shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="eyebrow">
                {f.kind === "revision" ? "Report revision" : "Follow-up"} · {formatRelative(f.createdAt)}
              </p>
              <h3 className="mt-2 font-display text-[26px] leading-tight text-ink">{f.question}</h3>
              <AnimatePresence mode="wait">
                {f.status === "running" ? (
                  <motion.div key="run" exit={{ opacity: 0 }} className="mt-5 rounded-xl border border-line bg-surface p-4">
                    <ThinkingIndicator since={f.createdAt} />
                    <p className="mt-2 pl-11 text-[13px] text-ink-muted">Reading your follow-up, searching the web and scholarly literature, and re-checking this research&rsquo;s evidence…</p>
                  </motion.div>
                ) : f.status === "failed" ? (
                  <motion.div key="failed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
                    <AlertTriangle className="size-4 text-warn shrink-0" />
                    <p className="flex-1 min-w-[200px] text-[13.5px] text-ink-2">{f.answer[0] ?? "This follow-up couldn't be answered."}</p>
                    {!readOnly && (
                      <Button size="sm" variant="secondary" leading={<RotateCcw className="size-3.5" />} disabled={running} onClick={() => void askAgain(f.question)}>
                        Ask again
                      </Button>
                    )}
                  </motion.div>
                ) : f.kind === "revision" && f.revisionId ? (
                  <motion.div key="revision" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <RevisionCard revisionId={f.revisionId} instructions={f.question} since={f.createdAt} />
                  </motion.div>
                ) : (
                  <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <FollowUpAnswer followUp={f} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      ))}
    </section>
  );
}

export const FollowUpComposer = forwardRef<HTMLTextAreaElement>(function FollowUpComposer(_, ref) {
  const { research, readOnly } = useResearch();
  const { busy: running } = useThread();
  const ask = useAskFollowUp(research.id);
  const [q, setQ] = useState("");
  if (readOnly) return null;

  const submit = async (question = q) => {
    const text = question.trim();
    if (!text || running) return;
    setQ(""); // cleared at once; restored if sending fails so nothing is lost
    if (!(await ask(text)) && question === q) setQ(text);
  };

  return (
    <section aria-label="Ask a follow-up" className="mt-14 max-w-[720px]" data-print-hide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="rounded-2xl border border-line bg-raised shadow-sm focus-within:border-line-strong focus-within:shadow-md transition-[border-color,box-shadow]"
      >
        <label htmlFor="follow-up" className="sr-only">
          Follow-up question
        </label>
        <textarea
          id="follow-up"
          ref={ref}
          rows={1}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          maxLength={1000}
          placeholder="Ask a question, or ask Pramaan to change the report (e.g. “make it shorter”)…"
          className="block w-full resize-none bg-transparent outline-none focus-visible:outline-none px-4 pt-4 pb-2 text-[15px] placeholder:text-ink-faint min-h-[56px]"
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <p className="text-[12px] text-ink-faint pl-1">Questions are answered with fresh sources · change requests create a revised report</p>
          <button type="submit" disabled={!q.trim() || running} aria-label="Ask follow-up" className="grid place-items-center size-9 rounded-xl bg-ink text-bg disabled:opacity-30 active:scale-95 transition-transform">
            {running ? <Spinner /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" disabled={running} onClick={() => submit(s)} className={cn("h-8 px-3 rounded-full border border-line text-[12.5px] text-ink-muted hover:text-ink hover:border-line-strong transition-colors disabled:opacity-40")}>
            {s}
          </button>
        ))}
      </div>
    </section>
  );
});
