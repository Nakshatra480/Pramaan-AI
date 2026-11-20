"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Lightbulb, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { VerificationMark } from "@/components/animations/VerificationMark";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import type { Project } from "@/types";

const LIMIT = 4000;

const SNIPPETS = [
  "Prefer peer-reviewed research papers.",
  "Prioritize research from the last three years.",
  "Clearly distinguish established findings from emerging research.",
  "Always provide citations for factual claims.",
  "Summarise trade-offs as a short decision table.",
  "Explain technical terms for a non-specialist audience.",
];

/**
 * Instruction editor: a document-like writing surface with a line gutter,
 * suggested directives, character count and save/reset. Instructions are
 * handled as validated context by the planner, not appended to prompts (PRD §35).
 */
export function ProjectInstructionEditor({ project }: { project: Project }) {
  const toast = useToast();
  const [value, setValue] = useState(project.instructions);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const dirty = value !== project.instructions;
  const lines = useMemo(() => Math.max(8, value.split("\n").length), [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(280, el.scrollHeight)}px`;
  }, [value]);

  const save = async () => {
    setSaving(true);
    await services.projects.updateInstructions(project.id, value.trim());
    setSaving(false);
    setJustSaved(true);
    toast({ title: "Instructions updated." });
    setTimeout(() => setJustSaved(false), 2200);
  };

  const addSnippet = (s: string) => {
    setValue((v) => (v.trim() ? `${v.trimEnd()}\n\n${s}` : s));
    ref.current?.focus();
  };

  const over = value.length > LIMIT;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        <div className={cn("rounded-2xl border bg-raised shadow-sm transition-[border-color,box-shadow] focus-within:shadow-md", over ? "border-danger" : "border-line focus-within:border-line-strong")}>
          <div className="flex items-center justify-between px-5 h-12 border-b border-line">
            <span className="text-[12.5px] font-medium text-ink-muted">instructions.md</span>
            <AnimatePresence mode="wait">
              {justSaved ? (
                <motion.span key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 text-[12.5px] text-sage-ink">
                  <VerificationMark size={14} /> Saved
                </motion.span>
              ) : dirty ? (
                <motion.span key="d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-faint">
                  <span className="size-1.5 rounded-full bg-warn" /> Unsaved changes
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
          <div className="flex">
            <div aria-hidden className="select-none pt-5 pb-5 pl-4 pr-3 text-right text-[12px] leading-[28px] text-ink-faint/70 tabular font-mono border-r border-line/70 bg-subtle/40 rounded-bl-2xl">
              {Array.from({ length: lines }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <label htmlFor="instructions" className="sr-only">
              Project instructions
            </label>
            <textarea
              id="instructions"
              ref={ref}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={"You are assisting with…\n\nPrefer…\n\nAlways…"}
              spellCheck
              className="flex-1 min-w-0 resize-none bg-transparent outline-none focus-visible:outline-none px-5 py-5 text-[15px] leading-[28px] text-ink placeholder:text-ink-faint font-sans"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-line">
            <span className={cn("text-[12px] tabular", over ? "text-danger" : "text-ink-faint")} aria-live="polite">
              {value.length.toLocaleString()} / {LIMIT.toLocaleString()} characters
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" leading={<RotateCcw className="size-3.5" />} disabled={!dirty || saving} onClick={() => setValue(project.instructions)}>
                Reset
              </Button>
              <Button size="sm" disabled={!dirty || over} loading={saving} onClick={save}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-6">
        <div>
          <p className="eyebrow mb-3">How instructions are used</p>
          <ul className="space-y-2.5 text-[13.5px] text-ink-muted leading-relaxed">
            <li>Guide how Pramaan plans research and chooses sources.</li>
            <li>Shape the tone and structure of the final report.</li>
            <li>Apply to every research session in this project.</li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-3 inline-flex items-center gap-1.5">
            <Lightbulb className="size-3.5" /> Suggestions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SNIPPETS.filter((s) => !value.includes(s)).map((s) => (
              <button key={s} type="button" onClick={() => addSnippet(s)} className="text-left text-[12.5px] leading-snug px-2.5 py-1.5 rounded-lg border border-line text-ink-2 hover:border-line-strong hover:bg-subtle transition-colors">
                + {s}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
