import { AnimatePresence, motion } from "framer-motion";
import { Eye, FolderPlus, MoreHorizontal, RotateCcw, Search, Trash2 } from "lucide-react";
import { Link } from "@/components/ui/Link";
import { useRouter } from "@/lib/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatRelative } from "@/lib/utils/format";
import type { LibraryDocument } from "@/types";
import { DeleteDocumentDialog } from "./DeleteDocumentDialog";
import { DocumentThumb, KIND_META } from "./DocumentKind";
import { IndexingProgress } from "./IndexingProgress";
import { researchWithDocumentHref } from "@/lib/utils/library";

interface Props {
  doc: LibraryDocument;
  onAddToProject?: (doc: LibraryDocument) => void;
  projectId?: string;
}

export function DocumentCard({ doc, onAddToProject, projectId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const processing = doc.status !== "ready" && doc.status !== "failed";
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "group relative flex flex-col rounded-xl border bg-surface p-4 transition-[box-shadow,border-color,transform] duration-200",
        doc.status === "failed" ? "border-danger/40" : "border-line hover:border-line-strong hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      <div className="flex items-start gap-3">
        <DocumentThumb kind={doc.kind} />
        <div className="min-w-0 flex-1">
          <Link href={projectId ? `/library/${doc.id}?project=${projectId}` : `/library/${doc.id}`} className="block text-[14px] font-medium leading-snug text-ink line-clamp-2 after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
            {doc.title}
          </Link>
          <p className="mt-1 text-[12px] text-ink-faint truncate">{doc.filename}</p>
        </div>
        <div className="relative z-10 -mr-1 -mt-1">
          <Menu
            label={`Actions for ${doc.title}`}
            trigger={
              <IconButton label="Document actions" size="sm" className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100">
                <MoreHorizontal className="size-4" />
              </IconButton>
            }
            items={[
              { label: "Preview", icon: <Eye />, onSelect: () => router.push(projectId ? `/library/${doc.id}?project=${projectId}` : `/library/${doc.id}`) },
              { label: "Research with this", icon: <Search />, disabled: doc.status !== "ready", onSelect: () => router.push(researchWithDocumentHref(doc, projectId)) },
              { label: "Add to project", icon: <FolderPlus />, onSelect: () => onAddToProject?.(doc) },
              "separator",
              projectId
                ? {
                    label: "Remove from project",
                    icon: <Trash2 />,
                    tone: "danger",
                    onSelect: async () => {
                      await services.library.removeFromProject(doc.id, projectId);
                      toast({ title: "Removed from project." });
                    },
                  }
                : {
                    label: "Delete from library",
                    icon: <Trash2 />,
                    tone: "danger",
                    onSelect: () => setDeleteOpen(true),
                  },
            ]}
          />
        </div>
      </div>

      <div className="mt-4 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {processing ? (
            <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <IndexingProgress stage={doc.status} />
            </motion.div>
          ) : doc.status === "failed" ? (
            <motion.div key="f" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10">
              <p className="text-[12.5px] text-danger leading-snug">This document could not be processed.</p>
              {doc.error && <p className="mt-1 text-[12px] text-ink-muted line-clamp-2">{doc.error}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="xs" variant="secondary" leading={<RotateCcw className="size-3" />} onClick={() => services.library.retry(doc.id)}>
                  Retry
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.p key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12.5px] leading-relaxed text-ink-muted line-clamp-2">
              {doc.summary}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 pt-3 border-t border-line flex items-center gap-2 text-[11.5px] text-ink-faint tabular">
        <span className="text-ink-muted">{KIND_META[doc.kind].label}</span>
        <span aria-hidden>·</span>
        <span>{formatBytes(doc.sizeBytes)}</span>
        {doc.chunks ? (
          <>
            <span aria-hidden>·</span>
            <span>{doc.chunks} passages</span>
          </>
        ) : null}
        <span className="ml-auto">{formatRelative(doc.addedAt)}</span>
      </div>
    </motion.div>
    <DeleteDocumentDialog doc={deleteOpen ? doc : null} onClose={() => setDeleteOpen(false)} />
    </>
  );
}

export function DocumentCardSkeleton() {
  return (
    <div className="rounded-xl border border-line/70 p-4 h-[172px]" aria-hidden>
      <div className="flex gap-3">
        <Skeleton className="w-10 h-12 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="mt-5 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-2/3" />
      <Skeleton className="mt-6 h-2.5 w-1/2" />
    </div>
  );
}
