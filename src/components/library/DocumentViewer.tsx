import { motion } from "framer-motion";
import { ChevronLeft, Download, FolderPlus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Link } from "@/components/ui/Link";
import { useRouter } from "@/lib/navigation";
import { useState } from "react";
import { PramaanLoader } from "@/components/brand/PramaanLoader";
import { VerificationMark } from "@/components/animations/VerificationMark";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { formatBytes, formatDate } from "@/lib/utils/format";
import { AddToProjectDialog } from "./AddToProjectDialog";
import { DeleteDocumentDialog } from "./DeleteDocumentDialog";
import { KIND_META } from "./DocumentKind";
import { IndexingProgress } from "./IndexingProgress";

export function DocumentViewer({ documentId }: { documentId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { data: doc, loading } = useResource(() => services.library.get(documentId), [documentId]);
  const { data: projects } = useResource(() => services.projects.list(), []);
  const { data: collections } = useResource(() => services.library.collections(), []);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (loading)
    return (
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-10 py-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]" aria-busy="true">
        <div className="max-w-[680px] space-y-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-11 w-5/6" />
          <Skeleton className="h-3 w-48" />
          <div className="pt-8 space-y-8">
            <SkeletonText lines={5} />
            <SkeletonText lines={4} />
          </div>
        </div>
        <Skeleton className="h-80 rounded-xl hidden lg:block" />
      </div>
    );

  if (!doc)
    return <EmptyState title="Document not found" description="It may have been removed from your library." action={<ButtonLink href="/library">Back to library</ButtonLink>} />;

  const processing = doc.status !== "ready" && doc.status !== "failed";
  const docProjects = (projects ?? []).filter((p) => doc.projectIds.includes(p.id));
  const docCollections = (collections ?? []).filter((c) => doc.collectionIds.includes(c.id));

  const meta: [string, React.ReactNode][] = [
    ["Title", doc.title],
    ["Author", doc.author ?? "—"],
    ["Date", doc.publishedAt ? formatDate(doc.publishedAt) : "—"],
    ["Source", doc.source ?? "—"],
    ["Type", KIND_META[doc.kind].label],
    ["Size", formatBytes(doc.sizeBytes)],
    ...(doc.pages ? ([["Pages", doc.pages]] as [string, React.ReactNode][]) : []),
    ...(doc.chunks ? ([["Indexed passages", doc.chunks]] as [string, React.ReactNode][]) : []),
    ["Added", formatDate(doc.addedAt)],
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-10 py-8 sm:py-10">
      <Link href="/library" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Library
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-14">
        <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="min-w-0 max-w-[680px]">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge tone="outline">{KIND_META[doc.kind].label}</Badge>
            {doc.status === "ready" ? (
              <Badge tone="sage">
                <VerificationMark size={12} /> Ready for research
              </Badge>
            ) : doc.status === "failed" ? (
              <Badge tone="danger">Processing failed</Badge>
            ) : (
              <Badge tone="neutral">Indexing</Badge>
            )}
          </div>
          <h1 className="font-display text-[34px] sm:text-[44px] leading-[1.06] text-ink text-balance">{doc.title}</h1>
          <p className="mt-3 text-[14px] text-ink-muted">
            {[doc.author, doc.source, doc.publishedAt && formatDate(doc.publishedAt, { month: "long", year: "numeric" })].filter(Boolean).join(" · ")}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              leading={<Search className="size-4" />}
              disabled={doc.status !== "ready"}
              onClick={() => router.push(`/research/new?q=${encodeURIComponent(`Summarise the key findings of “${doc.title}”`)}`)}
            >
              Research with this
            </Button>
            <Button variant="secondary" leading={<FolderPlus className="size-4" />} onClick={() => setAddOpen(true)}>
              Add to project
            </Button>
            <Button
              variant="ghost"
              leading={<Download className="size-4" />}
              disabled={doc.kind === "website" && services.mode === "api"}
              onClick={async () => {
                try {
                  const { blob, filename } = await services.library.download(doc);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  toast({ title: "Download started." });
                } catch (e) {
                  toast({ title: "Couldn't download this file", description: e instanceof Error ? e.message : undefined, tone: "error" });
                }
              }}
            >
              Download
            </Button>
            <Button variant="ghost" className="text-danger" leading={<Trash2 className="size-4" />} onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>

          <div className="mt-10 border-t border-line pt-10">
            {processing ? (
              <div className="flex flex-col items-center text-center py-10">
                <PramaanLoader size={88} label="Indexing document" />
                <p className="mt-6 text-[15px] font-medium text-ink">Preparing this document for research</p>
                <div className="mt-4 w-full max-w-xs">
                  <IndexingProgress stage={doc.status} />
                </div>
              </div>
            ) : doc.status === "failed" ? (
              <EmptyState
                compact
                title="This document could not be processed."
                description={doc.error}
                action={
                  <>
                    <Button leading={<RotateCcw className="size-4" />} onClick={() => services.library.retry(doc.id)}>
                      Retry
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
                      Delete
                    </Button>
                  </>
                }
              />
            ) : (
              <div className="space-y-10">
                {doc.content.map((section, i) => (
                  <section key={i}>
                    {section.heading && <h2 className="font-display text-[26px] text-ink mb-4">{section.heading}</h2>}
                    <div className="prose-report">
                      {section.paragraphs.map((p, j) => (
                        <p key={j}>{p}</p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </motion.article>

        <aside aria-label="Document details" className="lg:sticky lg:top-24 self-start space-y-6">
          <div className="rounded-xl border border-line bg-surface">
            <p className="px-4 pt-4 pb-2 eyebrow">Details</p>
            <dl className="divide-y divide-line">
              {meta.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[13px]">
                  <dt className="text-ink-faint">{k}</dt>
                  <dd className="text-ink-2 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <p className="eyebrow mb-2.5">Used in projects</p>
            {docProjects.length ? (
              <ul className="space-y-1">
                {docProjects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}/library`} className="text-[13.5px] text-ink-2 hover:text-ink underline decoration-line-strong underline-offset-4">
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-muted">Not in any project yet.</p>
            )}
          </div>
          {docCollections.length > 0 && (
            <div>
              <p className="eyebrow mb-2.5">Collections</p>
              <div className="flex flex-wrap gap-1.5">
                {docCollections.map((c) => (
                  <Badge key={c.id} tone="outline">
                    {c.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
      <AddToProjectDialog doc={addOpen ? doc : null} onClose={() => setAddOpen(false)} />
      <DeleteDocumentDialog doc={deleteOpen ? doc : null} onClose={() => setDeleteOpen(false)} beforeDelete={() => router.replace("/library")} />
    </div>
  );
}
