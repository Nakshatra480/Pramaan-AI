"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { ease } from "@/lib/motion";
import { ResearchMarquee } from "./Story";

/** Signed-in visitors go straight to the workspace; everyone else signs up first. */
export function useStartHref() {
  const { status } = useAuth();
  return status === "authenticated" ? "/app" : "/auth/signup";
}

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease: ease.out },
});

export function Hero() {
  const start = useStartHref();
  return (
    <section id="product" className="relative overflow-hidden flex flex-col min-h-[calc(100svh-4rem)]" aria-labelledby="hero-h">
      <HeroBackdrop />
      <div className="relative flex-1 flex items-center mx-auto w-full max-w-[1240px] px-4 sm:px-8 pt-6 pb-[22vh] sm:pb-[36vh] lg:py-10">
        <div>
          <motion.p {...rise(0.05)} className="eyebrow">
            AI research, grounded in evidence.
          </motion.p>
          <h1 id="hero-h" className="mt-5 font-display text-[56px] xs:text-[64px] sm:text-[84px] lg:text-[92px] leading-[0.96] tracking-[-0.02em] text-ink">
            <motion.span {...rise(0.12)} className="block">
              Research,
            </motion.span>
            <motion.span {...rise(0.24)} className="block italic text-[#5A6F5E] dark:text-sage-ink">
              with evidence.
            </motion.span>
          </h1>
          <motion.p {...rise(0.36)} className="mt-7 max-w-[400px] text-[17px] leading-relaxed text-ink-muted">
            Ask a question. Get a researched answer with verified claims and citations to the source.
          </motion.p>
          <motion.div {...rise(0.46)} className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link href={start} className="group inline-flex items-center gap-2 h-12 px-6 rounded-lg bg-ink text-bg text-[15px] font-medium transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
              Start researching <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link href="#how-it-works" className="group inline-flex items-center gap-3 text-[15px] text-ink">
              <span className="grid place-items-center size-11 rounded-full border border-line-strong bg-surface transition-colors group-hover:border-ink">
                <Play className="size-3.5 fill-current translate-x-px" />
              </span>
              See how it works
            </Link>
          </motion.div>
          <motion.p {...rise(0.56)} className="mt-6 text-[12.5px] text-ink-faint">
            Free during early access.
          </motion.p>
        </div>
      </div>
      <div className="relative">
        <ResearchMarquee />
      </div>
    </section>
  );
}

/**
 * Atmospheric research still-life behind the hero. Objects sit on the right; the left stays
 * quiet for the headline. Slow parallax and a gentle settle-in scale — no blur, no overlays.
 */
function HeroBackdrop() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 80]);
  const scale = useTransform(scrollY, [0, 800], [1, reduce ? 1 : 1.04]);
  return (
    <motion.div aria-hidden style={{ y }} className="absolute inset-x-0 bottom-0 top-[58%] sm:top-[45%] lg:top-0 pointer-events-none">
      <motion.div style={{ scale }} className="absolute inset-0 origin-[75%_40%]">
        <motion.div initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.8, ease: ease.out }} className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/landing/hero-research.webp"
            alt=""
            width={1024}
            height={637}
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover object-[78%_50%] lg:inset-auto lg:top-0 lg:right-0 lg:h-auto lg:w-full lg:min-w-[1100px] lg:max-w-none [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_85%,transparent)] lg:[mask-image:linear-gradient(to_right,transparent_22%,black_48%),linear-gradient(to_bottom,black_80%,transparent)] lg:[mask-composite:intersect] dark:opacity-40"
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
