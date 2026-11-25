import { FileText, FileType2, Globe, NotebookPen, ScrollText, type LucideIcon } from "lucide-react";
import type { DocumentKind } from "@/types";
import { cn } from "@/lib/utils/cn";

export const KIND_META: Record<DocumentKind, { label: string; icon: LucideIcon }> = {
  pdf: { label: "PDF", icon: FileText },
  paper: { label: "Paper", icon: ScrollText },
  docx: { label: "DOCX", icon: FileType2 },
  txt: { label: "Text", icon: FileText },
  markdown: { label: "Markdown", icon: NotebookPen },
  note: { label: "Note", icon: NotebookPen },
  website: { label: "Website", icon: Globe },
};

/** A document "spine": small paper-like tile showing the file kind. */
export function DocumentThumb({ kind, size = "md", className }: { kind: DocumentKind; size?: "sm" | "md"; className?: string }) {
  const Icon = KIND_META[kind].icon;
  return (
    <span
      className={cn(
        "relative inline-grid place-items-center shrink-0 rounded-md border border-line bg-gradient-to-b from-raised to-subtle text-ink-muted",
        size === "md" ? "w-10 h-12" : "w-8 h-9",
        className,
      )}
      aria-hidden
    >
      <span className="absolute top-0 right-0 size-2.5 bg-muted rounded-bl-[4px] border-l border-b border-line" />
      <Icon className={size === "md" ? "size-4" : "size-3.5"} strokeWidth={1.6} />
      <span className="absolute bottom-1 text-[7.5px] font-semibold tracking-wider uppercase text-ink-faint">{KIND_META[kind].label.slice(0, 4)}</span>
    </span>
  );
}
