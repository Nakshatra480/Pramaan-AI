import { ArrowRight, FileText } from "lucide-react";
import { Link } from "@/components/ui/Link";
import { ResearchComposer } from "@/components/research/ResearchComposer";
import { ResearchRow, ResearchRowSkeleton } from "@/components/research/ResearchList";
import { EmptyState } from "@/components/ui/EmptyState";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { pluralize } from "@/lib/utils/format";
import type { Project } from "@/types";
import { DocumentThumb } from "@/components/library/DocumentKind";

export function ProjectWorkspace({ project }: { project: Project }) {
  const { data: research, loading } = useResource(() => services.research.list({ projectId: project.id }), [project.id]);
  const { data: docs } = useResource(() => services.library.list({ projectId: project.id }), [project.id]);
  const verified = (research ?? []).reduce((a, r) => a + (r.status === "complete" ? r.metrics.verifiedClaims : 0), 0);
  const note = project.instructions
    ? `Your project instructions and ${pluralize(project.documentIds.length, "document")} will be used.`
    : `${pluralize(project.documentIds.length, "document")} will be used. Add instructions to guide Pramaan.`;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-14">
      <div className="min-w-0">
        <ResearchComposer projectId={project.id} lockProject placeholder="Research something in this project…" footerNote={note} />

        <section className="mt-10" aria-labelledby="pr-h">
          <h2 id="pr-h" className="font-display text-[24px] text-ink mb-1">
            Project research
          </h2>
          {loading ? (
            <ResearchRowSkeleton />
          ) : research?.length ? (
            <div className="divide-y divide-line">
              {research.map((r) => (
                <ResearchRow key={r.id} research={r} showProject={false} />
              ))}
            </div>
          ) : (
            <EmptyState compact title="Your research starts here." description="Research in this project uses its instructions and documents, and stays together over time." />
          )}
        </section>
      </div>

      <aside className="space-y-10">
        <dl className="grid grid-cols-3 lg:grid-cols-1 gap-5 lg:gap-6">
          {[
            ["Research", project.researchCount],
            ["Documents", project.documentIds.length],
            ["Verified claims", verified],
          ].map(([k, v]) => (
            <div key={k as string} className="lg:flex lg:items-baseline lg:justify-between lg:border-b lg:border-line lg:pb-3">
              <dt className="text-[12.5px] text-ink-muted order-2">{k}</dt>
              <dd className="font-display text-[30px] leading-none text-ink tabular">{v}</dd>
            </div>
          ))}
        </dl>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="eyebrow">Instructions</h3>
            <Link href={`/projects/${project.id}/instructions`} className="text-[12.5px] text-ink-muted hover:text-ink">
              Edit
            </Link>
          </div>
          {project.instructions ? (
            <p className="text-[13px] leading-relaxed text-ink-2 whitespace-pre-line line-clamp-6 border-l-2 border-sage-deep pl-3">{project.instructions}</p>
          ) : (
            <Link href={`/projects/${project.id}/instructions`} className="block rounded-lg border border-dashed border-line-strong p-4 text-[13px] text-ink-muted hover:text-ink hover:border-ink-faint">
              Tell Pramaan how to work within this project →
            </Link>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="eyebrow">Library</h3>
            <Link href={`/projects/${project.id}/library`} className="text-[12.5px] text-ink-muted hover:text-ink inline-flex items-center gap-1">
              All <ArrowRight className="size-3" />
            </Link>
          </div>
          {docs?.length ? (
            <ul className="space-y-2">
              {docs.slice(0, 4).map((d) => (
                <li key={d.id}>
                  <Link href={`/library/${d.id}`} className="flex items-center gap-3 hover:opacity-80">
                    <DocumentThumb kind={d.kind} size="sm" />
                    <span className="text-[13px] text-ink-2 line-clamp-2 leading-snug">{d.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Link href={`/projects/${project.id}/library`} className="flex items-center gap-2 text-[13px] text-ink-muted hover:text-ink">
              <FileText className="size-4" /> Add documents
            </Link>
          )}
        </section>
      </aside>
    </div>
  );
}
