import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BookMarked,
  BookOpen,
  Check,
  EyeOff,
  FileSearch,
  FileText,
  FolderLock,
  Globe,
  Library,
  Link2,
  MessageSquare,
  Network,
  Quote,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "@/components/ui/Link";
import { Fragment, useRef, useState } from "react";
import { PramaanMark } from "@/components/brand/PramaanMark";
import { ClaimStatusBadge } from "@/components/ui/StatusIndicator";
import { DEMO_DOCUMENT, DEMO_GROUNDED, DEMO_PAPER } from "@/data/landing-demo";
import { PLANS } from "@/data/plans";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";
import { Branch } from "./Art";
import { CITED, CLAIMS, METRICS, QUESTION, SUMMARY, TRAILS, WEB_RESULTS } from "./demo";
import { useStartHref } from "./Hero";

const inView = (delay = 0, y = 16) => ({
  initial: { opacity: 0, y },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, delay, ease: ease.out },
});

function Head({ eyebrow, title, id, children, center }: { eyebrow: string; title: React.ReactNode; id: string; children?: React.ReactNode; center?: boolean }) {
  return (
    <motion.div {...inView()} className={cn("max-w-xl", center && "mx-auto text-center")}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="mt-4 font-display text-[40px] sm:text-[56px] leading-[1.02] tracking-[-0.01em] text-ink text-balance">
        {title}
      </h2>
      {children && <p className={cn("mt-5 max-w-md text-[16px] leading-relaxed text-ink-muted", center && "mx-auto")}>{children}</p>}
    </motion.div>
  );
}

/* ================================================================ Marquee */

const LABELS: [string, typeof Search][] = [
  ["Research", Search],
  ["Evidence", Quote],
  ["Sources", Globe],
  ["Verification", BadgeCheck],
  ["Citations", Link2],
  ["Analysis", Network],
  ["Academic papers", BookMarked],
  ["Documents", FileText],
];

/** Slow, continuous band of research vocabulary. Pauses on hover; stops for reduced motion. */
export function ResearchMarquee() {
  const row = (hidden?: boolean) => (
    <ul aria-hidden={hidden} className="flex shrink-0 items-center">
      {LABELS.map(([label, Icon]) => (
        <li key={label} className="flex items-center gap-3 px-8 sm:px-10 whitespace-nowrap">
          <Icon className="size-4 text-sage-ink" strokeWidth={1.5} />
          <span className="text-[12px] sm:text-[12.5px] font-medium uppercase tracking-[0.28em] text-ink-2">{label}</span>
          <span aria-hidden className="ml-8 sm:ml-10 size-1 rotate-45 bg-line-strong" />
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="What Pramaan works with" className="group relative overflow-hidden border-y border-line bg-surface/70 py-5 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className="flex w-max animate-[marquee_70s_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none">
        {row()}
        {row(true)}
      </div>
    </section>
  );
}

/* ================================================================ Properties strip */

const PROPS = [
  { icon: FileText, t: "Verified claims", b: "Every claim is checked and cited." },
  { icon: BookOpen, t: "Multiple sources", b: "Web, academic papers and your documents." },
  { icon: ShieldCheck, t: "Your research, your control", b: "Private documents, scoped by project." },
  { icon: EyeOff, t: "No hidden reasoning", b: "You see sources, passages and verification." },
];

export function Properties() {
  return (
    <section aria-label="What every answer includes" className="mx-auto max-w-[1240px] px-4 sm:px-8 py-10">
      <ul className="grid gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {PROPS.map((p, i) => (
          <motion.li key={p.t} {...inView(i * 0.08, 10)} className={cn("flex gap-4 lg:px-7", i > 0 && "lg:border-l border-line", i === 0 && "lg:pl-0")}>
            <span className="grid place-items-center size-11 shrink-0 rounded-full bg-muted text-ink-muted">
              <p.icon className="size-[18px]" strokeWidth={1.5} />
            </span>
            <span>
              <span className="block text-[14.5px] font-medium text-ink">{p.t}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-ink-muted">{p.b}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

/* ================================================================ Why Pramaan */

const COMPARE = [
  { icon: Globe, label: "Sources", chat: "Not always shown", pramaan: "Collected first — web, papers, your files" },
  { icon: ScanSearch, label: "Claims", chat: "Not individually checked", pramaan: "Each labelled by its supporting evidence" },
  { icon: Link2, label: "Citations", chat: "Links, if any, chosen by the model", pramaan: "Mapped to the exact passage collected" },
  { icon: FileText, label: "Result", chat: "A single reply in the conversation", pramaan: "A report: findings, analysis, limitations" },
];

const FINDINGS = CLAIMS.filter((c) => c.status === "supported" && c.cite).slice(0, 3);

export function WhyPramaan() {
  return (
    <section id="why" className="scroll-mt-16 relative border-t border-line" aria-labelledby="why-h">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-8 py-20 sm:py-28 grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:items-center">
        <div>
          <Head eyebrow="Why Pramaan" title={<>Not a chat reply.<br />A research result.</>} id="why-h">
            A typical assistant gives you one fluent response. Pramaan researches across sources, verifies the important claims, and returns a structured report with citations.
          </Head>
        </div>
        <div className="grid gap-5 md:grid-cols-2 md:items-start">
          {/* typical chat */}
          <motion.article {...inView(0.1, 24)} className="rounded-2xl border border-line bg-bg p-6 md:mt-8" aria-label="A typical chat reply">
            <p className="flex items-center gap-2 text-[13px] text-ink-muted">
              <MessageSquare className="size-4" strokeWidth={1.5} /> A typical chat reply
            </p>
            <p className="mt-5 ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-muted px-4 py-3 text-[13.5px] text-ink-2">{QUESTION}</p>
            <p className="mt-3 max-w-[92%] rounded-xl rounded-tl-sm border border-line px-4 py-3 text-[13.5px] leading-relaxed text-ink-muted">
              Lighthouses moved from kerosene to electric light in the late 19th and early 20th centuries as electricity became more reliable and widespread…
            </p>
            <p className="mt-2 text-[11px] text-ink-faint">Illustrative example</p>
            <dl className="mt-6 divide-y divide-line border-t border-line">
              {COMPARE.map((r) => (
                <div key={r.label} className="grid grid-cols-[96px_1fr] gap-3 py-3 text-[12.5px]">
                  <dt className="flex items-center gap-2 text-ink-muted">
                    <r.icon className="size-3.5" strokeWidth={1.5} /> {r.label}
                  </dt>
                  <dd className="text-ink-faint">{r.chat}</dd>
                </div>
              ))}
            </dl>
          </motion.article>
          {/* Pramaan */}
          <motion.article {...inView(0.25, 32)} className="relative rounded-2xl border border-ink/80 bg-surface p-6 shadow-[0_30px_60px_-30px_rgba(40,36,24,0.35)]" aria-label="A Pramaan research result">
            <p className="flex items-center gap-2 text-[13px] text-ink">
              <PramaanMark size={16} sparkle={false} /> A Pramaan research result
            </p>
            <p className="mt-5 font-display text-[21px] leading-tight text-ink">{QUESTION}</p>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink">Key findings</p>
              <span className="rounded-md bg-sage-soft px-2 py-0.5 text-[11px] text-sage-ink tabular">
                {METRICS.verifiedClaims} of {METRICS.candidateClaims} claims supported
              </span>
            </div>
            <ol className="mt-3 space-y-2.5">
              {FINDINGS.map((c, i) => (
                <motion.li key={c.id} {...inView(0.45 + i * 0.12, 8)} className="flex gap-3 rounded-lg border border-line bg-bg p-3">
                  <span className="grid place-items-center shrink-0 size-6 rounded-full bg-[#5A6F5E] text-[11px] text-[#FAF8ED] tabular">{c.cite}</span>
                  <span className="text-[12.5px] leading-snug text-ink-2">{c.text}</span>
                </motion.li>
              ))}
            </ol>
            <dl className="mt-5 divide-y divide-line border-t border-line">
              {COMPARE.map((r, i) => (
                <motion.div key={r.label} {...inView(0.6 + i * 0.08, 0)} className="grid grid-cols-[96px_1fr] gap-3 py-3 text-[12.5px]">
                  <dt className="flex items-center gap-2 text-ink">
                    <r.icon className="size-3.5 text-sage-ink" strokeWidth={1.6} /> {r.label}
                  </dt>
                  <dd className="text-ink-2">{r.pramaan}</dd>
                </motion.div>
              ))}
            </dl>
          </motion.article>
        </div>
      </div>
    </section>
  );
}

/* ================================================================ How it works — the real research graph, static */

/**
 * Mirrors backend/app/research/graph.py: the planner fans out to three research agents that run in
 * parallel (web, academic, knowledge retrieval), which converge on evidence → claims → verification →
 * synthesis + citations. Deliberately static: no motion in this section.
 */
const AGENTS = [
  { icon: Globe, label: "Web", note: "Current sources" },
  { icon: BookMarked, label: "Academic", note: "Papers via OpenAlex" },
  { icon: Library, label: "Library", note: "Your documents" },
];

// Diagram geometry (viewBox units). Nodes are HTML placed by percentage over a static SVG of connectors.
const VB = { w: 960, h: 300 };
const Q = { x: 0, y: 122, w: 132, h: 56 };
const GROUP = { x: 196, y: 18, w: 236, h: 264 };
const AGENT_Y = [74, 138, 202];
const AGENT = { x: 214, w: 200, h: 56 };
const EV = { x: 512, y: 126, w: 112, h: 48 };
const VER = { x: 668, y: 126, w: 112, h: 48 };
const REP = { x: 824, y: 98, w: 136, h: 104 };
const mid = 150;

const pct = (r: { x: number; y: number; w: number; h: number }) => ({
  left: `${(r.x / VB.w) * 100}%`,
  top: `${(r.y / VB.h) * 100}%`,
  width: `${(r.w / VB.w) * 100}%`,
  height: `${(r.h / VB.h) * 100}%`,
});

const link = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

function Small({ icon: Icon, label, note, className }: { icon: typeof Search; label: string; note: string; className?: string }) {
  return (
    <div className={cn("flex h-full items-center gap-3 rounded-lg border border-line bg-surface px-3", className)}>
      <span className="grid place-items-center size-7 shrink-0 rounded-md bg-sage-soft text-sage-ink">
        <Icon className="size-[15px]" strokeWidth={1.6} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[11.5px] text-ink-faint">{note}</span>
      </span>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 border-t border-line bg-surface/50" aria-labelledby="how-h">
      <div className="mx-auto max-w-[1080px] px-4 sm:px-8 py-20 sm:py-24">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 id="how-h" className="mt-4 font-display text-[40px] sm:text-[56px] leading-[1.02] tracking-[-0.01em] text-ink">
              A team of agents working
              <br className="hidden sm:block" /> for deeper answers.
            </h2>
          </div>
          <p className="max-w-sm text-[15.5px] leading-relaxed text-ink-muted lg:pb-2">
            A planner splits your question into research directions. Agents search in parallel, and only verified claims reach the report.
          </p>
        </div>

        {/* desktop / tablet diagram */}
        <figure className="relative mt-14 hidden md:block" aria-label="Question, then web, academic and library agents in parallel, converging on evidence, verification and a cited report.">
          <div className="relative w-full" style={{ aspectRatio: `${VB.w} / ${VB.h}` }}>
            <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="absolute inset-0 size-full overflow-visible" fill="none" aria-hidden>
              {AGENT_Y.map((y) => (
                <path key={`in${y}`} d={link(Q.x + Q.w, mid, AGENT.x, y + AGENT.h / 2)} stroke="var(--line-strong)" strokeWidth="1" />
              ))}
              {AGENT_Y.map((y) => (
                <path key={`out${y}`} d={link(AGENT.x + AGENT.w, y + AGENT.h / 2, EV.x, mid)} stroke="var(--line-strong)" strokeWidth="1" />
              ))}
              <path d={`M${EV.x + EV.w} ${mid} H${VER.x}`} stroke="var(--line-strong)" strokeWidth="1" />
              <path d={`M${VER.x + VER.w} ${mid} H${REP.x}`} stroke="#5A6F5E" strokeWidth="1.2" />
              {[Q.x + Q.w, EV.x, VER.x, REP.x].map((x) => (
                <circle key={x} cx={x} cy={mid} r="2.5" fill="var(--bg)" stroke="#5A6F5E" strokeWidth="1" />
              ))}
            </svg>

            {/* question */}
            <div className="absolute" style={pct(Q)}>
              <div className="flex h-full items-center gap-2.5 rounded-full border border-ink/70 bg-surface px-4">
                <Sparkles className="size-4 text-sage-ink" strokeWidth={1.6} />
                <span className="text-[13.5px] font-medium text-ink">Question</span>
              </div>
            </div>

            {/* research agents — the centre of the composition */}
            <div className="absolute rounded-2xl border border-line bg-bg/80 shadow-[0_20px_40px_-28px_rgba(40,36,24,0.35)]" style={pct(GROUP)}>
              <p className="absolute top-[5%] inset-x-0 text-center whitespace-nowrap text-[10px] uppercase tracking-[0.22em] text-ink-faint">Research agents · parallel</p>
            </div>
            {AGENTS.map((a, i) => (
              <div key={a.label} className="absolute" style={pct({ x: AGENT.x, y: AGENT_Y[i], w: AGENT.w, h: AGENT.h })}>
                <Small {...a} />
              </div>
            ))}

            {/* evidence → verify */}
            <div className="absolute" style={pct(EV)}>
              <div className="flex h-full items-center justify-center gap-2 rounded-lg border border-line bg-surface">
                <Quote className="size-3.5 text-sage-ink" strokeWidth={1.6} />
                <span className="text-[13px] text-ink">Evidence</span>
              </div>
            </div>
            <div className="absolute" style={pct(VER)}>
              <div className="flex h-full items-center justify-center gap-2 rounded-lg border border-line bg-surface">
                <BadgeCheck className="size-3.5 text-sage-ink" strokeWidth={1.6} />
                <span className="text-[13px] text-ink">Verify</span>
              </div>
            </div>

            {/* report — the outcome */}
            <div className="absolute" style={pct(REP)}>
              <div className="relative h-full">
                <div aria-hidden className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl border border-line bg-surface" />
                <div className="relative flex h-full flex-col justify-between rounded-xl bg-ink p-3.5 text-bg">
                  <FileText className="size-4 text-sage" strokeWidth={1.6} />
                  <span>
                    <span className="block font-display text-[22px] leading-none">Report</span>
                    <span className="mt-1 block text-[11px] text-bg/60">Cited · verified</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <figcaption className="mt-8 grid grid-cols-[132fr_64fr_236fr_80fr_112fr_44fr_112fr_44fr_136fr] text-[11.5px] text-ink-faint">
            <span>Scope understood</span>
            <span />
            <span className="text-center">Run at the same time</span>
            <span />
            <span className="text-center">Passages, verbatim</span>
            <span />
            <span className="text-center">Claim by claim</span>
            <span />
            <span className="text-right">Synthesis &amp; citations</span>
          </figcaption>
        </figure>

        {/* mobile */}
        <ol className="mt-10 space-y-3 md:hidden" aria-label="How a question is researched">
          <li className="flex items-center gap-2.5 self-start rounded-full border border-ink/70 bg-surface px-4 py-2.5 w-fit">
            <Sparkles className="size-4 text-sage-ink" strokeWidth={1.6} />
            <span className="text-[13.5px] font-medium text-ink">Question</span>
          </li>
          <li className="ml-5 border-l border-line-strong pl-5 py-1">
            <div className="rounded-2xl border border-line bg-bg/80 p-3 space-y-2">
              <p className="px-1 text-[10.5px] uppercase tracking-[0.22em] text-ink-faint">Research agents · parallel</p>
              {AGENTS.map((a) => (
                <div key={a.label} className="h-14">
                  <Small {...a} />
                </div>
              ))}
            </div>
          </li>
          <li className="ml-5 border-l border-line-strong pl-5 py-1 flex gap-2">
            <span className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface py-3 text-[13px] text-ink">
              <Quote className="size-3.5 text-sage-ink" strokeWidth={1.6} /> Evidence
            </span>
            <span className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface py-3 text-[13px] text-ink">
              <BadgeCheck className="size-3.5 text-sage-ink" strokeWidth={1.6} /> Verify
            </span>
          </li>
          <li className="ml-5 border-l border-[#5A6F5E] pl-5 pt-1">
            <div className="flex items-center justify-between rounded-xl bg-ink p-4 text-bg">
              <span className="font-display text-[22px] leading-none">Report</span>
              <span className="text-[11px] text-bg/60">Cited · verified</span>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}

/* ================================================================ Report showcase */

type Focus = { cite?: number; claim?: string } | null;

function SummaryText({ focus, setFocus }: { focus: Focus; setFocus: (f: Focus) => void }) {
  const parts = SUMMARY.split(/\[(\d+)\]/);
  return (
    <p className="text-[15px] leading-[1.75] text-ink-2">
      {parts.map((p, i) =>
        i % 2 ? (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setFocus({ cite: Number(p) })}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus({ cite: Number(p) })}
            onBlur={() => setFocus(null)}
            aria-label={`Citation ${p}`}
            className={cn("mx-0.5 inline-grid place-items-center align-[2px] size-[18px] rounded text-[10.5px] tabular transition-colors", focus?.cite === Number(p) ? "bg-[#5A6F5E] text-[#FAF8ED]" : "bg-sage-soft text-sage-ink")}
          >
            {p}
          </button>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </p>
  );
}

export function ReportShowcase() {
  const [focus, setFocus] = useState<Focus>(null);
  const claims = CLAIMS.slice(0, 6);
  const activeClaim = claims.find((c) => c.id === focus?.claim) ?? null;
  const activeCite = focus?.cite ?? activeClaim?.cite;
  const passage = activeClaim?.passage ?? (activeCite ? CLAIMS.find((c) => c.cite === activeCite && c.passage)?.passage : undefined);
  const counts = { supported: CLAIMS.filter((c) => c.status === "supported").length, partial: CLAIMS.filter((c) => c.status === "partially_supported").length, insufficient: CLAIMS.filter((c) => c.status === "insufficient_evidence").length };

  return (
    <section id="report" className="scroll-mt-16 border-t border-line" aria-labelledby="report-h">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-8 py-20 sm:py-28">
        <Head eyebrow="The result" title="A report you can inspect." id="report-h" center>
          This is a real Pramaan report. Hover a citation, a claim or a source to follow the evidence.
        </Head>

        <motion.div {...inView(0.1, 40)} className="relative mt-14">
          <div aria-hidden className="absolute inset-x-6 -bottom-3 top-3 rounded-2xl border border-line bg-surface rotate-[0.6deg]" />
          <div className="relative rounded-2xl border border-line-strong/70 bg-surface shadow-[0_40px_80px_-40px_rgba(40,36,24,0.4)] grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="p-6 sm:p-10 lg:border-r border-line">
              <p className="flex items-center gap-2 text-[12px] uppercase tracking-[0.2em] text-ink-faint">
                <PramaanMark size={14} sparkle={false} /> Research report · Standard
              </p>
              <h3 className="mt-4 font-display text-[28px] sm:text-[36px] leading-[1.08] text-ink">{QUESTION}</h3>
              <div className="mt-5 flex flex-wrap gap-2 text-[11.5px]">
                <span className="rounded-md bg-sage-soft px-2 py-1 text-sage-ink">{counts.supported} supported</span>
                <span className="rounded-md bg-warn-soft px-2 py-1 text-warn">{counts.partial} partially supported</span>
                <span className="rounded-md border border-dashed border-line-strong px-2 py-1 text-ink-muted">{counts.insufficient} insufficient evidence</span>
              </div>
              <p className="mt-7 text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">Summary</p>
              <div className="mt-3">
                <SummaryText focus={focus} setFocus={setFocus} />
              </div>
              <p className="mt-8 text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">Claims</p>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {claims.map((c, i) => {
                  const lit = focus?.claim === c.id || (focus?.cite !== undefined && c.cite === focus.cite);
                  return (
                    <motion.li key={c.id} {...inView(0.05 * i, 6)}>
                      <button
                        type="button"
                        onMouseEnter={() => setFocus({ claim: c.id })}
                        onMouseLeave={() => setFocus(null)}
                        onFocus={() => setFocus({ claim: c.id })}
                        onBlur={() => setFocus(null)}
                        className={cn("w-full flex items-start gap-3 py-3 px-2 -mx-2 rounded-md text-left transition-colors", lit ? "bg-sage-soft/60" : "hover:bg-muted/50")}
                      >
                        <span className="flex-1 text-[13.5px] leading-snug text-ink-2">
                          {c.text}
                          {c.cite && <span className="ml-1.5 inline-grid place-items-center size-4 rounded bg-muted align-[1px] text-[9.5px] tabular text-ink-2">{c.cite}</span>}
                        </span>
                        <ClaimStatusBadge status={c.status} className="shrink-0" />
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
            <aside className="p-6 sm:p-8 bg-bg/60 rounded-b-2xl lg:rounded-bl-none lg:rounded-r-2xl">
              <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">Sources cited</p>
              <ul className="mt-3 space-y-2">
                {CITED.map((s) => {
                  const lit = activeCite === s.index;
                  return (
                    <li key={s.id}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        onMouseEnter={() => setFocus({ cite: s.index })}
                        onMouseLeave={() => setFocus(null)}
                        onFocus={() => setFocus({ cite: s.index })}
                        onBlur={() => setFocus(null)}
                        className={cn("flex gap-3 rounded-lg border p-3 transition-[border-color,background-color,transform] duration-300", lit ? "border-[#5A6F5E] bg-surface -translate-x-1" : "border-line bg-surface/70 hover:border-line-strong")}
                      >
                        <span className={cn("grid place-items-center size-6 shrink-0 rounded text-[11px] tabular transition-colors", lit ? "bg-[#5A6F5E] text-[#FAF8ED]" : "bg-muted text-ink-2")}>{s.index}</span>
                        <span className="min-w-0">
                          <span className="block text-[13px] leading-snug text-ink line-clamp-2">{s.title}</span>
                          <span className="mt-0.5 block text-[11.5px] text-ink-faint truncate">{s.domain}</span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-7 text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">Evidence passage</p>
              <div className="mt-3 min-h-[132px] rounded-lg border border-line bg-surface p-4">
                {passage ? (
                  <motion.blockquote key={passage} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="border-l-2 border-[#5A6F5E] pl-3 font-display text-[16px] leading-snug text-ink">
                    &ldquo;{passage.replace(/\s+/g, " ").trim()}&rdquo;
                  </motion.blockquote>
                ) : (
                  <p className="text-[13px] leading-relaxed text-ink-faint">Hover a claim or citation to see the verbatim passage it rests on.</p>
                )}
              </div>
            </aside>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ================================================================ Evidence chain */

const TRAIL = TRAILS[0];

export function EvidenceChain() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const line = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const steps = [
    { k: "Claim", icon: ScanSearch, body: <p className="text-[15px] leading-snug text-ink">{TRAIL.claim}</p>, foot: <ClaimStatusBadge status={TRAIL.status} /> },
    { k: "Evidence", icon: Quote, body: <p className="font-display text-[17px] leading-snug text-ink">&ldquo;{TRAIL.passage.replace(/\s+/g, " ").trim()}&rdquo;</p>, foot: <span className="text-[11.5px] text-ink-faint">Extracted verbatim</span> },
    { k: "Source", icon: Globe, body: <><p className="text-[14.5px] text-ink">{TRAIL.source.title}</p><p className="mt-1 text-[12px] text-ink-faint">{TRAIL.source.domain}</p></>, foot: <span className="text-[11.5px] text-ink-faint truncate block">{TRAIL.source.url}</span> },
    { k: "Citation", icon: Link2, body: <p className="text-[14.5px] leading-snug text-ink-2">…the first tower to use an electric light <span className="inline-grid place-items-center size-[18px] rounded bg-[#5A6F5E] align-[2px] text-[10.5px] text-[#FAF8ED] tabular">{TRAIL.index}</span></p>, foot: <span className="text-[11.5px] text-ink-faint">Mapped from the source record, never generated</span> },
  ];
  return (
    <section id="evidence" className="scroll-mt-16 relative overflow-hidden border-t border-line bg-surface/60" aria-labelledby="chain-h">
      <Branch className="pointer-events-none absolute -left-10 bottom-0 w-[180px] opacity-50 hidden lg:block" />
      <div ref={ref} className="relative mx-auto max-w-[1240px] px-4 sm:px-8 py-20 sm:py-28 grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="lg:sticky lg:top-32 self-start">
          <Head eyebrow="Evidence" title="Every claim has an address." id="chain-h">
            Each statement in a report resolves to a passage, the passage to its source, and the source to a numbered citation.
          </Head>
        </div>
        <ol className="relative space-y-5 pl-14">
          <span aria-hidden className="absolute left-[19px] top-6 bottom-6 w-px bg-line" />
          <motion.span aria-hidden style={{ scaleY: line }} className="absolute left-[19px] top-6 bottom-6 w-px origin-top bg-[#5A6F5E]" />
          {steps.map((s, i) => (
            <motion.li key={s.k} {...inView(i * 0.1, 18)} className="relative">
              <span className="absolute -left-14 top-4 grid place-items-center size-10 rounded-full border border-line-strong bg-surface text-sage-ink">
                <s.icon className="size-4" strokeWidth={1.6} />
              </span>
              <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                <p className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">{String(i + 1).padStart(2, "0")} · {s.k}</p>
                <div className="mt-3">{s.body}</div>
                <div className="mt-4 border-t border-line pt-3">{s.foot}</div>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ================================================================ Sources */

const GROUNDED_PASSAGE = DEMO_GROUNDED.evidence[0]?.passage ?? "";
const GROUNDED_CLAIM = DEMO_GROUNDED.claims.find((c) => c.text.includes("1931") && c.status === "supported")?.text ?? "";

export function SourcesSection() {
  const highlight = "converted to electricity in 1931";
  const [before, after] = GROUNDED_PASSAGE.split(highlight);
  return (
    <section id="sources" className="scroll-mt-16 border-t border-line" aria-labelledby="sources-h">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-8 py-20 sm:py-28">
        <Head eyebrow="Sources" title="Three places to look. One standard of evidence." id="sources-h" center />
        <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-3">
          {/* Web */}
          <motion.div {...inView(0, 24)} className="rounded-2xl border border-line bg-surface p-5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink"><Globe className="size-4 text-sage-ink" strokeWidth={1.6} /> Web</p>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-[12px] text-ink-muted">
              <Search className="size-3.5" /> <span className="truncate">{QUESTION}</span>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {WEB_RESULTS.map((r, i) => (
                <motion.li key={r.title} {...inView(0.15 + i * 0.08, 6)} className="py-2.5">
                  <p className="text-[11px] text-ink-faint">{r.domain}</p>
                  <p className="text-[13px] leading-snug text-ink line-clamp-1">{r.title}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <motion.span className="block h-full bg-sage-deep" initial={{ width: 0 }} whileInView={{ width: `${r.relevance * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.3 + i * 0.08 }} />
                    </span>
                    <span className="text-[10.5px] text-ink-faint tabular">{r.relevance.toFixed(2)}</span>
                  </div>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Academic */}
          <motion.div {...inView(0.12, 24)} className="rounded-2xl border border-line bg-surface p-5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink"><BookMarked className="size-4 text-sage-ink" strokeWidth={1.6} /> Academic</p>
            <div className="relative mt-4">
              <div aria-hidden className="absolute inset-0 translate-x-2 translate-y-2 rounded-lg border border-line bg-bg" />
              <article className="relative rounded-lg border border-line-strong/60 bg-[#FBF7EA] p-4">
                <p className="text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">{DEMO_PAPER.publisher} · {DEMO_PAPER.publishedAt?.slice(0, 4)}</p>
                <p className="mt-2 font-display text-[19px] leading-tight text-ink">{DEMO_PAPER.title}</p>
                <p className="mt-2 text-[11.5px] text-ink-muted">{DEMO_PAPER.authors.join(", ")}</p>
                <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">Abstract</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-2 line-clamp-4">{DEMO_PAPER.abstract}</p>
                <p className="mt-3 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-ink-muted tabular">DOI {DEMO_PAPER.doi}</p>
              </article>
            </div>
          </motion.div>

          {/* Library */}
          <motion.div {...inView(0.24, 24)} className="rounded-2xl border border-line bg-surface p-5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink"><FolderLock className="size-4 text-sage-ink" strokeWidth={1.6} /> Your library</p>
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2.5">
              <FileSearch className="size-4 text-ink-muted" strokeWidth={1.5} />
              <span className="flex-1 text-[12.5px] text-ink">{DEMO_DOCUMENT.title}.{DEMO_DOCUMENT.kind}</span>
              <span className="text-[10.5px] text-ink-faint">{DEMO_DOCUMENT.sizeBytes} B · private</span>
            </div>
            <p className="mt-4 text-[12.5px] leading-relaxed text-ink-2">
              {before}
              {after !== undefined && <motion.mark initial={{ backgroundColor: "rgba(203,214,202,0)" }} whileInView={{ backgroundColor: "rgba(203,214,202,0.9)" }} viewport={{ once: true }} transition={{ delay: 0.6, duration: 0.8 }} className="rounded px-0.5 text-ink">{highlight}</motion.mark>}
              {after}
            </p>
            <div className="mt-4 rounded-lg border border-line bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <ClaimStatusBadge status="supported" />
                <span className="text-[10.5px] text-ink-faint">From a grounded run</span>
              </div>
              <p className="mt-2 text-[12.5px] text-ink">{GROUNDED_CLAIM}</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================ Pricing */

export function PricingSection() {
  const start = useStartHref();
  return (
    <section id="pricing" className="scroll-mt-16 border-t border-line bg-surface/60" aria-labelledby="pricing-h">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-8 py-20 sm:py-28">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Head eyebrow="Pricing" title="Simple plans for serious research." id="pricing-h">
            Free during early access. Paid plans are listed so you know what&rsquo;s coming.
          </Head>
          <motion.div {...inView(0.15)}>
            <Link href="/pricing" className="group inline-flex items-center gap-1.5 text-[14px] text-ink underline-offset-4 hover:underline">
              Compare plans <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p, i) => (
            <motion.li key={p.id} {...inView(i * 0.08, 14)} className={cn("relative flex flex-col p-7", p.highlighted ? "bg-surface" : "bg-bg")}>
              {p.highlighted && <span className="absolute top-0 inset-x-0 h-0.5 bg-[#5A6F5E]" />}
              <p className="flex items-center justify-between text-[14px] font-medium text-ink">
                {p.name}
              </p>
              <p className="mt-5">
                <span className="font-display text-[48px] leading-none text-ink">${p.price}</span>
                <span className="ml-1.5 text-[12.5px] text-ink-muted">{p.price ? p.cadence : "forever"}</span>
              </p>
              <p className="mt-3 text-[13px] text-ink-muted">{p.tagline}</p>
              <ul className="mt-6 space-y-2 text-[13px] text-ink-2 flex-1">
                {p.features.slice(0, 3).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="size-3.5 mt-[3px] text-sage-ink shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              {p.price ? (
                <p className="mt-7 inline-flex h-10 items-center justify-center rounded-lg border border-dashed border-line-strong text-[13.5px] text-ink-muted">Coming soon</p>
              ) : (
                <Link href={start} className="mt-7 inline-flex h-10 items-center justify-center rounded-lg bg-ink text-bg text-[13.5px] font-medium transition-colors hover:bg-ink/90">
                  Start free
                </Link>
              )}
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ================================================================ Trust */

const TRUST = [
  { icon: Link2, t: "Traceable citations", b: "Attached from collected passages, never written by the model." },
  { icon: BadgeCheck, t: "Evidence-backed claims", b: "Supported, partially supported or insufficient evidence — labelled." },
  { icon: FolderLock, t: "Private documents", b: "Used only for your research and never to train models." },
  { icon: EyeOff, t: "Transparent results", b: "Sources, passages and verification — not hidden reasoning." },
];

export function TrustSection() {
  const insufficient = CLAIMS.find((c) => c.status === "insufficient_evidence");
  return (
    <section id="trust" className="scroll-mt-16 border-t border-line" aria-labelledby="trust-h">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-8 py-20 sm:py-28 grid gap-14 lg:grid-cols-2 lg:items-center">
        <div>
          <Head eyebrow="Trust" title="Built to be checked." id="trust-h" />
          <ul className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {TRUST.map((t, i) => (
              <motion.li key={t.t} {...inView(0.1 + i * 0.07, 10)}>
                <t.icon className="size-5 text-sage-ink" strokeWidth={1.5} />
                <p className="mt-3 text-[14.5px] font-medium text-ink">{t.t}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{t.b}</p>
              </motion.li>
            ))}
          </ul>
        </div>
        {/* archival evidence composition */}
        <div className="relative mx-auto w-full max-w-[480px] aspect-[1/0.9]" aria-hidden>
          <motion.div {...inView(0, 30)} className="absolute left-[4%] top-[6%] w-[70%] rotate-[-5deg] rounded-md border border-line-strong/60 bg-[#FBF6E8] p-6 shadow-md">
            <p className="text-[10px] uppercase tracking-[0.22em] text-ink-faint">Exhibit · claim 10</p>
            <p className="mt-3 font-display text-[19px] leading-snug text-ink">{insufficient?.text}</p>
            <div className="mt-6 space-y-2">
              {[90, 76, 84, 60].map((w, i) => (
                <span key={i} className="block h-px bg-line-strong" style={{ width: `${w}%` }} />
              ))}
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 1.4, rotate: -20 }} whileInView={{ opacity: 1, scale: 1, rotate: -12 }} viewport={{ once: true }} transition={{ delay: 0.6, duration: 0.5, ease: ease.out }} className="absolute left-[38%] top-[34%] rounded border-2 border-dashed border-ink-muted/70 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-muted">
            Insufficient evidence
          </motion.div>
          <motion.div {...inView(0.25, 30)} className="absolute right-[2%] bottom-[4%] w-[62%] rotate-[3deg] rounded-xl border border-line bg-surface p-5 shadow-[0_24px_50px_-24px_rgba(40,36,24,0.4)]">
            <div className="flex items-center justify-between">
              <ClaimStatusBadge status="supported" />
              <span className="text-[10.5px] text-ink-faint tabular">confidence {(TRAIL ? CLAIMS.find((c) => c.text === TRAIL.claim)?.confidence ?? 0.75 : 0.75).toFixed(2)}</span>
            </div>
            <p className="mt-3 text-[13.5px] leading-snug text-ink">{TRAIL.claim}</p>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-faint">
              <span className="grid place-items-center size-4 rounded bg-muted text-[9.5px] text-ink-2 tabular">{TRAIL.index}</span>
              {TRAIL.source.domain}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================ Final CTA */

export function FinalCTA() {
  const start = useStartHref();
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1.12, 1]);
  return (
    <section className="border-t border-line" aria-labelledby="cta-h">
      <div ref={ref} className="mx-auto max-w-[1240px] px-4 sm:px-8 py-20 sm:py-24">
        <div className="relative overflow-hidden rounded-3xl bg-[#1F2A22] grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] min-h-[420px]">
          <div className="relative z-10 flex flex-col justify-center px-8 py-14 sm:px-14">
            <motion.p {...inView(0)} className="text-[11px] uppercase tracking-[0.3em] text-[#AFC0B0]">Pramaan · proof</motion.p>
            <motion.h2 {...inView(0.1)} id="cta-h" className="mt-5 font-display text-[44px] sm:text-[64px] leading-[1] text-[#FAF8ED] text-balance">
              Your next question deserves <em className="text-[#CBD6CA]">evidence.</em>
            </motion.h2>
            <motion.div {...inView(0.25)} className="mt-9">
              <Link href={start} className="group inline-flex items-center gap-2 h-12 px-6 rounded-lg bg-[#FAF8ED] text-[#191A17] text-[15px] font-medium transition-colors hover:bg-white">
                Start researching <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          </div>
          <div className="relative min-h-[260px] overflow-hidden">
            <motion.div style={{ scale }} className="absolute inset-0">
              <img src="/auth/coast.png" alt="A lighthouse on a rocky coast at dawn, beside a stack of research books" className="size-full object-cover object-top" />
            </motion.div>
            <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#1F2A22] via-[#1F2A22]/40 to-transparent lg:via-[#1F2A22]/20" />
          </div>
        </div>
      </div>
    </section>
  );
}
