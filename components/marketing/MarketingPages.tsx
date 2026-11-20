"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Reveal, SlideUp } from "@/components/animations/Motion";
import { ButtonLink } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { PLANS } from "@/data/plans";
import { cn } from "@/lib/utils/cn";
import { FAQ } from "./Landing";

function PageHero({ eyebrow, title, body }: { eyebrow: string; title: React.ReactNode; body: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-[1200px] px-4 sm:px-8 pt-16 sm:pt-24 pb-12">
      <SlideUp>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-5 font-display text-[48px] sm:text-[80px] leading-[0.98] text-ink max-w-4xl text-balance">{title}</h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-muted">{body}</p>
      </SlideUp>
    </section>
  );
}

/* ------------------------------- Pricing ------------------------------- */

export function PricingPage() {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  return (
    <>
      <PageHero eyebrow="Pricing" title="Simple plans for serious research." body="Pramaan is free during early access. Paid plans are listed so you know what's coming — they can't be purchased yet." />
      <section className="mx-auto max-w-[1200px] px-4 sm:px-8 pb-24">
        <Segmented
          label="Billing cycle"
          value={cycle}
          onChange={setCycle}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly · save 20%" },
          ]}
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p, i) => {
            const price = cycle === "yearly" ? Math.round(p.price * 0.8) : p.price;
            return (
              <Reveal key={p.id} delay={i * 0.05} className={cn("relative rounded-2xl border p-7 flex flex-col", p.highlighted ? "border-ink bg-surface shadow-lg" : "border-line bg-surface")}>
                <p className="text-[15px] font-semibold text-ink">{p.name}</p>
                <p className="mt-1 text-[13px] text-ink-muted min-h-10">{p.tagline}</p>
                <p className="mt-6">
                  <span className="font-display text-[56px] leading-none text-ink">${price}</span>
                  <span className="ml-1.5 text-[13px] text-ink-muted">{p.price ? p.cadence : "forever"}</span>
                </p>
                <ul className="mt-7 space-y-2.5 text-[14px] text-ink-2 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className="size-4 mt-0.5 text-accent shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {p.price ? (
                  <p className="mt-8 h-10 inline-flex items-center justify-center rounded-lg border border-dashed border-line-strong text-[13.5px] text-ink-muted">Coming soon</p>
                ) : (
                  <ButtonLink href="/auth/signup" className="mt-8" variant="primary">
                    Start free
                  </ButtonLink>
                )}
              </Reveal>
            );
          })}
        </div>
        <p className="mt-6 text-[13px] text-ink-faint">Planned prices in USD. No payment details are collected, and early-access usage limits aren&rsquo;t enforced.</p>
      </section>
      <FAQ />
    </>
  );
}

const PRIVACY: { title: string; body: string[] }[] = [
  {
    title: "What Pramaan stores",
    body: [
      "Your sign-in is handled by Firebase Authentication (email and password, or Google). Pramaan never sees or stores your password.",
      "Your profile, projects, research reports, sources, evidence and preferences are stored in Pramaan's Postgres database. Files you upload, and the text extracted from them, are stored in Pramaan's file storage.",
    ],
  },
  {
    title: "Who processes your text",
    body: [
      "To answer a question, Pramaan sends the question and the passages it reads to a hosted language model (Groq) and a hosted embedding service (OpenRouter). Uploaded documents are sent to the embedding service in chunks when they are indexed.",
      "Web and academic searches send search queries derived from your question to Tavily and OpenAlex. Search results and question embeddings may be cached for up to 7 days to make repeated research faster.",
    ],
  },
  {
    title: "Sharing",
    body: ["Research is private to you, and to members of a project you add it to. A share link shows that report and its sources to anyone who has the link, until you revoke it."],
  },
  {
    title: "Your controls",
    body: [
      "Settings → Privacy lets you export everything as JSON, delete all research, or set automatic deletion of unsaved research after 30, 90 or 365 days.",
      "Deleting your account immediately and permanently removes your sign-in, the projects you own, your library files and your research.",
    ],
  },
];

export function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Privacy" title="How Pramaan handles your data." body="A plain description of what happens to your data in Pramaan today." />
      <section className="mx-auto max-w-[760px] px-4 sm:px-8 pb-24 space-y-10">
        {PRIVACY.map((s) => (
          <div key={s.title}>
            <h2 className="font-display text-[26px] text-ink">{s.title}</h2>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-2">
              {s.body.map((b) => (
                <p key={b}>{b}</p>
              ))}
            </div>
          </div>
        ))}
        <p className="text-[13px] text-ink-muted">This page describes how the product works. It is not a legal agreement.</p>
      </section>
    </>
  );
}
