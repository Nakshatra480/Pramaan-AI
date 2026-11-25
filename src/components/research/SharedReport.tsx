import { Link } from "@/components/ui/Link";
import { PramaanLogo } from "@/components/brand/PramaanLogo";
import { PramaanMark } from "@/components/brand/PramaanMark";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { ResearchProvider } from "./ResearchContext";
import { ResearchReport } from "./ResearchReport";
import { ResearchSkeleton } from "./ResearchSkeleton";
import { SourceDrawer } from "./SourceDrawer";
import { SourcePanel } from "./SourcePanel";

/** Read-only shared report (PRD §41). */
export function SharedReport({ shareId }: { shareId: string }) {
  const { data: research, loading } = useResource(() => services.research.getByShareId(shareId), [shareId]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-[var(--z-sticky)] h-16 flex items-center justify-between px-4 sm:px-8 bg-bg/85 backdrop-blur-md border-b border-line/70" data-print-hide>
        <Link href="/" aria-label="Pramaan AI">
          <PramaanLogo variant="compact" size="sm" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-[12.5px] text-ink-faint">Read-only · shared research</span>
          <ButtonLink href="/auth/signup" size="sm">
            Research with Pramaan
          </ButtonLink>
        </div>
      </header>

      {loading ? (
        <ResearchSkeleton />
      ) : !research?.report ? (
        <EmptyState title="This link isn't available" description="The owner may have made this research private, or the link is incorrect." action={<ButtonLink href="/">Go to Pramaan</ButtonLink>} />
      ) : (
        <ResearchProvider research={research} readOnly>
          <main id="main" className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-10 py-10 sm:py-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
            <ResearchReport />
            {/* Sources appear only here (not in the report body): beside the report on desktop, below it on small screens. */}
            <aside aria-label="Sources">
              <div className="lg:sticky lg:top-24">
                <SourcePanel />
              </div>
            </aside>
          </main>
          <SourceDrawer />
          <footer className="border-t border-line mt-10">
            <div className="mx-auto max-w-[1200px] px-4 sm:px-10 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <PramaanMark size={36} />
                <div>
                  <p className="font-display text-[24px] text-ink leading-tight">Research, with evidence.</p>
                  <p className="text-[13px] text-ink-muted">Every claim in this report traces back to its sources.</p>
                </div>
              </div>
              <ButtonLink href="/auth/signup">Research with Pramaan</ButtonLink>
            </div>
          </footer>
        </ResearchProvider>
      )}
    </div>
  );
}
