import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BookMarked, Briefcase, Check, Cpu, FlaskConical, Gavel, GraduationCap, HeartPulse, Landmark, Library, Globe, School, Sparkles } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { useEffect, useState } from "react";
import { PramaanResearchAnimation } from "@/components/animations/PramaanResearchAnimation";
import { PramaanLogo } from "@/components/brand/PramaanLogo";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { MODES } from "@/components/research/research-options";
import { Button } from "@/components/ui/Button";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";
import type { ResearchMode, SourceChannel } from "@/types";

const INTERESTS = [
  { id: "Technology", icon: Cpu },
  { id: "Science", icon: FlaskConical },
  { id: "Business", icon: Briefcase },
  { id: "Finance", icon: Landmark },
  { id: "Academia", icon: GraduationCap },
  { id: "Health", icon: HeartPulse },
  { id: "Law", icon: Gavel },
  { id: "Education", icon: School },
  { id: "General", icon: Sparkles },
];

const SOURCES: { id: SourceChannel; label: string; body: string; icon: typeof Globe }[] = [
  { id: "web", label: "Web", body: "Current reporting and documentation", icon: Globe },
  { id: "academic", label: "Academic", body: "Papers, journals and preprints", icon: BookMarked },
  { id: "library", label: "My Library", body: "Documents you upload", icon: Library },
];

export function Onboarding() {
  const { user, status, updateProfile } = useAuth();
  const { update } = usePreferences();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [interests, setInterests] = useState<string[]>([]);
  const [mode, setMode] = useState<ResearchMode>("standard");
  const [channels, setChannels] = useState<SourceChannel[]>(["web", "academic"]);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login?next=/onboarding");
    else if (user && !user.emailVerified) router.replace("/auth/verify");
    else if (user?.onboarded && !finishing) router.replace("/app"); // already set up (audit L-02)
  }, [status, user, router, finishing]);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  const finish = async () => {
    setFinishing(true);
    await update({ interests, defaultMode: mode, defaultChannels: channels }).catch(() => undefined); // kept on this device if the save fails
    await updateProfile({ onboarded: true });
    router.replace("/app");
  };

  const canNext = step === 0 ? interests.length > 0 : step === 2 ? channels.length > 0 : true;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="h-16 px-5 sm:px-10 flex items-center justify-between">
        <PramaanLogo variant="compact" size="sm" />
        <div className="flex items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} aria-label="Onboarding progress">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("h-1 rounded-full transition-all duration-500", i <= step ? "bg-ink w-8" : "bg-line-strong w-4")} />
          ))}
        </div>
      </header>

      <main id="main" className="flex-1 grid place-items-center px-5 py-10">
        <div className="w-full max-w-[640px] overflow-hidden">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.section
              key={step}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 40, filter: "blur(3px)" }),
                center: { opacity: 1, x: 0, filter: "blur(0px)" },
                exit: (d: number) => ({ opacity: 0, x: d * -40, filter: "blur(3px)" }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 0 && (
                <>
                  <p className="eyebrow">Step 1 of 4</p>
                  <h1 className="mt-3 font-display text-[40px] sm:text-[52px] leading-[1.02] text-ink">What do you research?</h1>
                  <p className="mt-3 text-[15px] text-ink-muted">Choose any that apply. This helps Pramaan choose sources.</p>
                  <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {INTERESTS.map((it) => {
                      const on = interests.includes(it.id);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setInterests((xs) => (on ? xs.filter((x) => x !== it.id) : [...xs, it.id]))}
                          className={cn("relative flex items-center gap-3 h-14 px-4 rounded-xl border text-left text-[14px] font-medium transition-[background-color,border-color,transform] active:scale-[0.98]", on ? "border-accent bg-sage-soft text-sage-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}
                        >
                          <it.icon className="size-4 shrink-0" strokeWidth={1.7} />
                          {it.id}
                          {on && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.snappy} className="ml-auto grid place-items-center size-5 rounded-full bg-accent text-bg">
                              <Check className="size-3" strokeWidth={3} />
                            </motion.span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <p className="eyebrow">Step 2 of 4</p>
                  <h1 className="mt-3 font-display text-[40px] sm:text-[52px] leading-[1.02] text-ink">How deep should Pramaan go?</h1>
                  <p className="mt-3 text-[15px] text-ink-muted">Your default research depth. You can change it for any question.</p>
                  <div className="mt-8 space-y-2.5" role="radiogroup">
                    {MODES.map((m, i) => {
                      const on = mode === m.value;
                      return (
                        <button key={m.value} type="button" role="radio" aria-checked={on} onClick={() => setMode(m.value)} className={cn("w-full flex items-center gap-4 rounded-xl border p-5 text-left transition-colors", on ? "border-accent bg-sage-soft/60" : "border-line bg-surface hover:border-line-strong")}>
                          <span className="flex gap-1" aria-hidden>
                            {[0, 1, 2].map((d) => (
                              <span key={d} className={cn("w-1.5 rounded-full", d <= i ? "bg-accent" : "bg-line-strong")} style={{ height: 10 + d * 6 }} />
                            ))}
                          </span>
                          <span className="flex-1">
                            <span className="flex items-center gap-2 text-[15px] font-medium text-ink">
                              {m.label}
                              {m.value === "standard" && <span className="text-[11.5px] font-normal text-ink-faint">Recommended</span>}
                            </span>
                            <span className="block text-[13.5px] text-ink-muted mt-0.5">{m.description}</span>
                          </span>
                          <span className={cn("grid place-items-center size-5 rounded-full border-[1.5px]", on ? "border-accent" : "border-line-strong")}>{on && <span className="size-2.5 rounded-full bg-accent" />}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <p className="eyebrow">Step 3 of 4</p>
                  <h1 className="mt-3 font-display text-[40px] sm:text-[52px] leading-[1.02] text-ink">Where should Pramaan look?</h1>
                  <p className="mt-3 text-[15px] text-ink-muted">Default sources for new research.</p>
                  <div className="mt-8 grid gap-2.5 sm:grid-cols-3">
                    {SOURCES.map((s) => {
                      const on = channels.includes(s.id);
                      return (
                        <button key={s.id} type="button" aria-pressed={on} onClick={() => setChannels((xs) => (on ? xs.filter((x) => x !== s.id) : [...xs, s.id]))} className={cn("relative rounded-xl border p-5 text-left transition-colors", on ? "border-accent bg-sage-soft/60" : "border-line bg-surface hover:border-line-strong")}>
                          <s.icon className={cn("size-5", on ? "text-sage-ink" : "text-ink-muted")} strokeWidth={1.6} />
                          <span className="mt-6 block text-[15px] font-medium text-ink">{s.label}</span>
                          <span className="block mt-1 text-[12.5px] text-ink-muted">{s.body}</span>
                          <span className={cn("absolute top-4 right-4 grid place-items-center size-5 rounded-[6px] border", on ? "bg-accent border-accent text-bg" : "border-line-strong")}>{on && <Check className="size-3" strokeWidth={3} />}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="text-center">
                  <div className="flex justify-center">
                    <PramaanResearchAnimation complete size={180} />
                  </div>
                  <p className="mt-6 eyebrow">Ready</p>
                  <h1 className="mt-3 font-display text-[44px] sm:text-[60px] leading-[1] text-ink">Your research starts here.</h1>
                  <p className="mt-4 text-[15px] text-ink-muted">You&rsquo;re ready. Ask your first question.</p>
                </div>
              )}
            </motion.section>
          </AnimatePresence>

          <div className={cn("mt-10 flex items-center", step === 3 ? "justify-center" : "justify-between")}>
            {step > 0 && step < 3 ? (
              <Button variant="ghost" leading={<ArrowLeft className="size-4" />} onClick={() => go(step - 1)}>
                Back
              </Button>
            ) : step === 0 ? (
              <button type="button" onClick={() => (setInterests(["General"]), go(1))} className="text-[13.5px] text-ink-muted hover:text-ink">
                Skip
              </button>
            ) : null}
            {step < 3 ? (
              <Button size="lg" disabled={!canNext} trailing={<ArrowRight className="size-4" />} onClick={() => go(step + 1)}>
                Continue
              </Button>
            ) : (
              <Button size="lg" loading={finishing} trailing={<ArrowRight className="size-4" />} onClick={finish}>
                Start researching
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
