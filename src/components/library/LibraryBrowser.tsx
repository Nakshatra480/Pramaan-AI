import { AnimatePresence, motion } from "framer-motion";
import { FolderPlus, LayoutGrid, List, Plus, Search, Upload, X } from "lucide-react";
import { Link } from "@/components/ui/Link";
import { useMemo, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { Tabs } from "@/components/ui/Tabs";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import { matchesLibraryFilter } from "@/lib/utils/library";
import { formatBytes, formatRelative } from "@/lib/utils/format";
import type { LibraryDocument, LibraryFilter } from "@/types";
import { AddToProjectDialog } from "./AddToProjectDialog";
import { DocumentCard, DocumentCardSkeleton } from "./DocumentCard";
import { DocumentThumb, KIND_META } from "./DocumentKind";
import { IndexingProgress } from "./IndexingProgress";
import { UploadDropzone } from "./UploadDropzone";

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pdf", label: "PDF" },
  { value: "documents", label: "Documents" },
  { value: "papers", label: "Papers" },
  { value: "websites", label: "Websites" },
];


/** Library browser — used for the global library and (scoped) for project libraries. */
export function LibraryBrowser({ projectId, initialUpload = false }: { projectId?: string; initialUpload?: boolean }) {
  const toast = useToast();
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [collection, setCollection] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploadOpen, setUploadOpen] = useState(initialUpload);
  const [addDoc, setAddDoc] = useState<LibraryDocument | null>(null);
  const [newCollection, setNewCollection] = useState<string | null>(null);

  const { data: all, loading } = useResource(() => services.library.list({ projectId }), [projectId]);
  const { data: collections } = useResource(() => services.library.collections(), []);

  const docs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (all ?? [])
      .filter((d) => matchesLibraryFilter(d, filter))
      .filter((d) => (collection ? d.collectionIds.includes(collection) : true))
      .filter((d) => (q ? `${d.title} ${d.filename} ${d.author ?? ""} ${d.summary}`.toLowerCase().includes(q) : true));
  }, [all, filter, collection, query]);

  const processing = (all ?? []).filter((d) => d.status !== "ready" && d.status !== "failed").length;

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <label htmlFor="lib-search" className="sr-only">
            Search library
          </label>
          <Input id="lib-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={projectId ? "Search project documents" : "Search your library"} leading={<Search className="size-4" />} />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center size-6 rounded text-ink-faint hover:text-ink">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            label="View"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "grid", label: <span className="sr-only">Grid</span>, icon: <LayoutGrid className="size-3.5" /> },
              { value: "list", label: <span className="sr-only">List</span>, icon: <List className="size-3.5" /> },
            ]}
          />
          <Button leading={uploadOpen ? <X className="size-4" /> : <Upload className="size-4" />} variant={uploadOpen ? "secondary" : "primary"} onClick={() => setUploadOpen((o) => !o)}>
            {uploadOpen ? "Close" : "Upload"}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {uploadOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="pt-5">
              <UploadDropzone projectId={projectId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs
        label="Document type"
        className="mt-6"
        value={filter}
        onChange={setFilter}
        items={FILTERS.map((f) => ({ ...f, count: (all ?? []).filter((d) => matchesLibraryFilter(d, f.value)).length }))}
      />

      {!projectId && (
        <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Collections">
          <CollectionPill active={collection === null} onClick={() => setCollection(null)}>
            All documents
          </CollectionPill>
          {(collections ?? []).map((c) => (
            <CollectionPill key={c.id} active={collection === c.id} onClick={() => setCollection(collection === c.id ? null : c.id)}>
              {c.name}
              <span className="text-ink-faint tabular">{c.documentIds.length}</span>
            </CollectionPill>
          ))}
          <button type="button" onClick={() => setNewCollection("")} className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12.5px] text-ink-muted hover:text-ink whitespace-nowrap">
            <Plus className="size-3.5" /> New collection
          </button>
        </div>
      )}

      {processing > 0 && (
        <p className="mt-4 inline-flex items-center gap-2 text-[12.5px] text-ink-muted" role="status">
          <span className="size-1.5 rounded-full bg-accent animate-pulse-soft" />
          Indexing {processing} {processing === 1 ? "document" : "documents"} for research
        </p>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <DocumentCardSkeleton key={i} />
            ))}
          </div>
        ) : (all ?? []).length === 0 ? (
          <EmptyState
            title={projectId ? "No documents yet" : "Build your research library."}
            description={projectId ? "Add papers, notes and files. Pramaan will use them as private evidence for research in this project." : "Upload papers, reports and notes. Pramaan cites the exact passages it uses from your documents."}
            action={
              <Button leading={<Upload className="size-4" />} onClick={() => setUploadOpen(true)}>
                Upload documents
              </Button>
            }
          />
        ) : docs.length === 0 ? (
          <EmptyState compact title="No matching documents" description="Try another search term or filter." action={<Button variant="secondary" onClick={() => (setQuery(""), setFilter("all"), setCollection(null))}>Clear filters</Button>} />
        ) : view === "grid" ? (
          <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {docs.map((d) => (
                <DocumentCard key={d.id} doc={d} onAddToProject={setAddDoc} projectId={projectId} />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
            {docs.map((d) => (
              <Link key={d.id} href={`/library/${d.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-subtle/60 transition-colors">
                <DocumentThumb kind={d.kind} size="sm" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] text-ink truncate">{d.title}</span>
                  <span className="block text-[12px] text-ink-faint truncate">{d.filename}</span>
                </span>
                <span className="hidden md:block w-40">{d.status !== "ready" ? <IndexingProgress stage={d.status} compact /> : <span className="text-[12px] text-ink-muted">{KIND_META[d.kind].label}</span>}</span>
                <span className="hidden sm:block w-16 text-right text-[12px] text-ink-faint tabular">{formatBytes(d.sizeBytes)}</span>
                <span className="w-20 text-right text-[12px] text-ink-faint">{formatRelative(d.addedAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <AddToProjectDialog doc={addDoc} onClose={() => setAddDoc(null)} />
      <Dialog
        open={newCollection !== null}
        onClose={() => setNewCollection(null)}
        title="New collection"
        description="Group related documents across projects."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewCollection(null)}>
              Cancel
            </Button>
            <Button
              leading={<FolderPlus className="size-4" />}
              disabled={!newCollection?.trim()}
              onClick={async () => {
                const c = await services.library.createCollection(newCollection!);
                setNewCollection(null);
                setCollection(c.id);
                toast({ title: "Collection created." });
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <label htmlFor="col-name" className="sr-only">
          Collection name
        </label>
        <Input id="col-name" data-autofocus value={newCollection ?? ""} onChange={(e) => setNewCollection(e.target.value)} placeholder="e.g. Literature review" />
      </Dialog>
    </div>
  );
}

function CollectionPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12.5px] font-medium whitespace-nowrap transition-colors",
        active ? "bg-ink text-bg border-ink" : "border-line text-ink-muted hover:text-ink hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}
