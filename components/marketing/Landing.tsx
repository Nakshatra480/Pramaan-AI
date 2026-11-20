"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";

/* FAQ — used by the pricing page (not the landing page). */
export const FAQS = [
  { q: "How is Pramaan different from an AI chatbot?", a: "Chatbots generate an answer and sometimes attach links. Pramaan runs a research process: it plans, collects evidence, verifies important claims against that evidence, and only then writes a report — with every citation mapped to a real passage." },
  { q: "Can Pramaan be wrong?", a: "Yes. Pramaan reduces unsupported claims and shows you exactly where each claim came from, but it doesn't guarantee correctness. Claims with weak support are labelled, and anything without enough evidence is excluded from the findings." },
  { q: "Which sources does Pramaan use?", a: "The open web, academic literature and your private library — you choose per question. Each source keeps its title, publisher, date and original link." },
  { q: "Are my documents private?", a: "Yes. Documents you upload are only retrieved for your research, and project documents only for that project. Nothing is shared unless you explicitly share a report." },
  { q: "Do you show the model's reasoning?", a: "Pramaan shows research artifacts — sources found, evidence passages, verification status — but not hidden chain-of-thought." },
  { q: "Can I export research?", a: "Export reports as PDF, Markdown or DOCX, copy the answer, or share a read-only link that includes citations and source details." },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-16 bg-surface border-y border-line" aria-labelledby="faq-h">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8 py-24 sm:py-32 grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-h" className="mt-4 font-display text-[38px] sm:text-[52px] leading-[1.02] text-ink">
            Questions, answered.
          </h2>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q}>
                <h3>
                  <button type="button" aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? null : i)} className="w-full flex items-center justify-between gap-6 py-5 text-left text-[16px] font-medium text-ink">
                    {f.q}
                    {isOpen ? <Minus className="size-4 text-ink-muted shrink-0" /> : <Plus className="size-4 text-ink-muted shrink-0" />}
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div id={`faq-${i}`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                      <p className="pb-6 pr-8 text-[15px] leading-relaxed text-ink-muted">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
