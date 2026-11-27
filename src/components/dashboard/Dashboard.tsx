import { ArrowRight } from "lucide-react";
import { Link } from "@/components/ui/Link";
import { useEffect, useState } from "react";
import { SlideUp } from "@/components/animations/Motion";
import { useAuth } from "@/components/providers/AuthProvider";
import { ResearchComposer } from "@/components/research/ResearchComposer";
import { ResearchRow, ResearchRowSkeleton } from "@/components/research/ResearchList";
import { EXAMPLE_QUESTIONS } from "@/components/research/research-options";
import { EmptyState } from "@/components/ui/EmptyState";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { greeting } from "@/lib/utils/format";

export function Dashboard({ initialQuery, initialProject, focusDocuments = [] }: { initialQuery?: string; initialProject?: string; focusDocuments?: string[] } = {}) {
  const { user } = useAuth();
  const { data: research, loading } = useResource(() => services.research.list(), []);
  const { data: projects } = useResource(() => services.projects.list(), []);
  const [hello, setHello] = useState("Welcome back");
  const [example, setExample] = useState<string | undefined>(initialQuery);

  useEffect(() => {
    // Time-of-day greeting is client-only to avoid hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHello(greeting());
  }, []);

  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
  const firstName = user?.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-[1080px] px-4 sm:px-6 lg:px-10">
      <section className="pt-12 sm:pt-20 pb-12 sm:pb-16" aria-labelledby="dash-h">
        <SlideUp>
          <p className="text-[14px] text-ink-muted">
            {hello}
            {firstName ? `, ${firstName}` : ""}.
          </p>
          <h1 id="dash-h" className="mt-2 font-display text-[40px] sm:text-[56px] leading-[1.02] text-ink text-balance">
            What would you like to research?
          </h1>
        </SlideUp>
        <SlideUp delay={0.08} className="mt-8 sm:mt-10">
          <ResearchComposer key={example} size="hero" initialQuery={example} projectId={initialProject ?? null} documentIds={example === initialQuery ? focusDocuments : []} autoFocus />
        </SlideUp>
        <SlideUp delay={0.14} className="mt-2 flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.slice(0, 3).map((q) => (
            <button key={q} type="button" onClick={() => setExample(q)} className="h-8 px-3 rounded-full border border-line text-[12.5px] text-ink-muted hover:text-ink hover:border-line-strong hover:bg-surface transition-colors truncate max-w-full">
              {q}
            </button>
          ))}
        </SlideUp>
      </section>

      <div className="pb-16">
        <section aria-labelledby="recent-h">
          <div className="flex items-baseline justify-between mb-2">
            <h2 id="recent-h" className="font-display text-[26px] text-ink">
              Recent research
            </h2>
            <Link href="/history" className="text-[13px] text-ink-muted hover:text-ink inline-flex items-center gap-1">
              View all <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {loading ? (
            <ResearchRowSkeleton count={5} />
          ) : research?.length ? (
            <div className="divide-y divide-line">
              {research.slice(0, 6).map((r) => (
                <ResearchRow key={r.id} research={r} project={r.projectId ? projectById.get(r.projectId) : undefined} />
              ))}
            </div>
          ) : (
            <EmptyState compact title="Your research starts here." description="Ask a question above. Pramaan will find sources, verify claims and write a cited report." />
          )}
        </section>

      </div>
    </div>
  );
}
