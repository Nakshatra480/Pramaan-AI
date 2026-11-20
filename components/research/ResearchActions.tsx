"use client";

import { ClipboardCopy, Download, FileCode2, FileText, FileType2, FolderInput, Link2, MessageSquarePlus, MoreHorizontal, Pencil, Printer, RotateCcw, Share2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VerificationMark } from "@/components/animations/VerificationMark";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import { downloadFile, researchToMarkdown, researchToPlainText, slugify } from "@/lib/utils/export";
import { useResearch } from "./ResearchContext";
import { ShareDialog } from "./ShareDialog";

export function ResearchActions({ onFollowUp }: { onFollowUp: () => void }) {
  const { research, sources } = useResearch();
  const router = useRouter();
  const toast = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);



  const md = () => researchToMarkdown(research, sources);
  const copy = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
    toast({ title });
  };

  const [againOpen, setAgainOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const researchAgain = () => setAgainOpen(true);
  const startAgain = async () => {
    setStarting(true);
    try {
      const r = await services.research.create({ query: research.query, mode: research.mode, channels: research.channels, projectId: research.projectId });
      router.push(`/research/${r.id}`);
    } catch (e) {
      setStarting(false);
      toast({ title: "Couldn't start research", description: e instanceof Error ? e.message : "Please try again.", tone: "error" });
    }
  };
  const editAndRun = () => {
    const q = new URLSearchParams({ q: research.query });
    if (research.projectId) q.set("project", research.projectId);
    router.push(`/research/new?${q.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-print-hide>
      <Button variant="secondary" size="sm" leading={<Share2 className="size-4" />} onClick={() => setShareOpen(true)}>
        Share
      </Button>
      <Menu
        label="Export"
        placement="bottom-start"
        open={exportOpen}
        onOpenChange={setExportOpen}
        trigger={
          <Button variant="secondary" size="sm" leading={<Download className="size-4" />}>
            Export
          </Button>
        }
        items={[
          { label: "PDF", icon: <Printer />, description: "Print-ready report", onSelect: () => setTimeout(() => window.print(), 120) },
          { label: "Markdown", icon: <FileCode2 />, description: ".md with numbered sources", onSelect: () => (downloadFile(`${slugify(research.title)}.md`, md()), toast({ title: "Markdown exported." })) },
          {
            label: "DOCX",
            icon: <FileType2 />,
            description: "Opens in Word or Google Docs",
            onSelect: () => {
              const html = `<html><head><meta charset="utf-8"><title>${research.title}</title></head><body><pre style="font-family:Georgia;white-space:pre-wrap">${md().replace(/</g, "&lt;")}</pre></body></html>`;
              downloadFile(`${slugify(research.title)}.doc`, html, "application/msword");
              toast({ title: "Document exported." });
            },
          },
          "separator",
          { label: "Copy answer", icon: <ClipboardCopy />, onSelect: () => copy(researchToPlainText(research), "Answer copied.") },
          { label: "Copy Markdown", icon: <FileText />, onSelect: () => copy(md(), "Markdown copied.") },
        ]}
      />
      <Button variant="ghost" size="sm" leading={<RotateCcw className="size-4" />} onClick={researchAgain} className="hidden sm:inline-flex">
        Research again
      </Button>
      <Button variant="ghost" size="sm" leading={<MessageSquarePlus className="size-4" />} onClick={onFollowUp} className="hidden sm:inline-flex">
        Follow-up
      </Button>
      <Menu
        label="More actions"
        placement="bottom-end"
        trigger={
          <IconButton label="More actions" size="md" variant="ghost" className="size-8">
            <MoreHorizontal className="size-4" />
          </IconButton>
        }
        items={[
          { label: "Research again", icon: <RotateCcw />, onSelect: researchAgain },
          { label: "Ask a follow-up", icon: <MessageSquarePlus />, onSelect: onFollowUp },
          "separator",
          { label: research.projectId ? "Move to another project" : "Add to project", icon: <FolderInput />, onSelect: () => setMoveOpen(true) },
          { label: "Rename", icon: <Pencil />, onSelect: () => setRenameOpen(true) },
          { label: "Copy link", icon: <Link2 />, onSelect: () => copy(window.location.href, "Link copied.") },
          "separator",
          { label: "Delete research", icon: <Trash2 />, tone: "danger", onSelect: () => setDeleteOpen(true) },
        ]}
      />

      <ShareDialog research={research} open={shareOpen} onClose={() => setShareOpen(false)} />
      <MoveToProjectDialog open={moveOpen} onClose={() => setMoveOpen(false)} />
      <RenameDialog open={renameOpen} onClose={() => setRenameOpen(false)} />
      <Dialog
        open={againOpen}
        onClose={() => !starting && setAgainOpen(false)}
        title="Research this question again?"
        description="Pramaan runs a new session with the same question, mode and sources. This report stays as it is."
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={starting} onClick={editAndRun}>
              Edit first
            </Button>
            <Button loading={starting} onClick={startAgain}>
              Start new research
            </Button>
          </>
        }
      />
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this research?"
        description="The report, evidence and follow-ups will be permanently removed. Shared links will stop working."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                router.replace("/history"); // leave first so this page doesn't refetch a deleted record (audit L-13)
                try {
                  await services.research.remove(research.id);
                  toast({ title: "Research deleted." });
                } catch (e) {
                  toast({ title: "Couldn't delete this research", description: e instanceof Error ? e.message : "Please try again.", tone: "error" });
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}

function MoveToProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { research } = useResearch();
  const toast = useToast();
  const { data: projects } = useResource(() => services.projects.list(), []);
  return (
    <Dialog open={open} onClose={onClose} title="Add to project" description="Research in a project uses and contributes to that project's context.">
      <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto thin-scrollbar">
        {[{ id: null, name: "No project", description: "Keep as independent research" }, ...(projects ?? [])].map((p) => (
          <li key={p.id ?? "none"}>
            <button
              type="button"
              onClick={async () => {
                await services.research.moveToProject(research.id, p.id);
                toast({ title: p.id ? `Added to ${p.name}.` : "Removed from project." });
                onClose();
              }}
              className={cn("w-full text-left flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors", research.projectId === p.id ? "border-accent bg-sage-soft/60" : "border-line hover:border-line-strong")}
            >
              <span>
                <span className="block text-[14px] font-medium text-ink">{p.name}</span>
                <span className="block text-[12.5px] text-ink-muted line-clamp-1">{p.description}</span>
              </span>
              {research.projectId === p.id && <VerificationMark size={18} />}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function RenameDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { research } = useResearch();
  const toast = useToast();
  const [title, setTitle] = useState(research.title);
  const [busy, setBusy] = useState(false);
  // Enter submits, like the Save button (audit L-01).
  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await services.research.rename(research.id, title.trim());
      toast({ title: "Research renamed." });
      onClose();
    } catch (e) {
      toast({ title: "Couldn't rename", description: e instanceof Error ? e.message : "Please try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rename research"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!title.trim()} loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor="rename" className="sr-only">
          Title
        </label>
        <Input id="rename" data-autofocus value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
      </form>
    </Dialog>
  );
}
