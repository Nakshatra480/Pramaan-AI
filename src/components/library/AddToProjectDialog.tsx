import { VerificationMark } from "@/components/animations/VerificationMark";
import { ProjectIcon } from "@/components/projects/ProjectIcon";
import { useToast } from "@/components/providers/ToastProvider";
import { Dialog } from "@/components/ui/Dialog";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import type { LibraryDocument } from "@/types";

export function AddToProjectDialog({ doc, onClose }: { doc: LibraryDocument | null; onClose: () => void }) {
  const toast = useToast();
  const { data: projects } = useResource(() => services.projects.list(), []);
  return (
    <Dialog open={Boolean(doc)} onClose={onClose} title="Add to project" description={doc ? `Make “${doc.title}” available to project research.` : undefined}>
      <ul className="space-y-1.5">
        {(projects ?? []).map((p) => {
          const added = doc?.projectIds.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={added}
                onClick={async () => {
                  if (!doc) return;
                  await services.library.addToProject(doc.id, p.id);
                  toast({ title: `Added to ${p.name}.` });
                  onClose();
                }}
                className={cn("w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors", added ? "border-line bg-subtle/60 cursor-default" : "border-line hover:border-line-strong")}
              >
                <ProjectIcon icon={p.icon} size="sm" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] text-ink">{p.name}</span>
                  <span className="block text-[12px] text-ink-faint">{p.documentIds.length} documents</span>
                </span>
                {added && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-sage-ink">
                    <VerificationMark size={14} /> Added
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
