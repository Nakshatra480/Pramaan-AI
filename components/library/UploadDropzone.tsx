"use client";

import { motion } from "framer-motion";
import { Link2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { track } from "@/lib/firebase/analytics";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import { rejectionMessage, splitUploads, UPLOAD_ACCEPT, UPLOAD_HINT } from "@/lib/utils/uploads";
import type { UploadedDocument } from "@/types";


/**
 * Upload surface. Validates type and size up front with the same rules as the
 * server (PRD §60 safe file handling); the backend validates again.
 */
export function UploadDropzone({ projectId, compact, onUploaded }: { projectId?: string; compact?: boolean; onUploaded?: () => void }) {
  const toast = useToast();
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");
  const [urlMode, setUrlMode] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handle = async (files: File[]) => {
    const { ok, rejected } = splitUploads(files);
    if (rejected.length) toast({ title: `${rejected.length} file${rejected.length > 1 ? "s" : ""} skipped`, description: rejectionMessage(rejected), tone: "error" });
    if (!ok.length) return;
    let uploaded: UploadedDocument[];
    try {
      uploaded = await services.library.upload(ok, { projectId });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Please try again.", tone: "error" });
      return;
    }
    void track("document_uploaded", { count: ok.length, in_project: Boolean(projectId) });
    const fresh = uploaded.filter((d) => !d.duplicate);
    const dupes = uploaded.filter((d) => d.duplicate);
    if (fresh.length) {
      toast({ title: fresh.length === 1 ? `Uploading ${fresh[0].filename}` : `Uploading ${fresh.length} documents`, description: "Pramaan will index them for research.", tone: "info" });
    }
    if (dupes.length) {
      // Audit L-06: identical content is not stored twice — say so instead of "Uploading…".
      toast({
        title: dupes.length === 1 ? "Already in your library" : `${dupes.length} documents already in your library`,
        description: dupes.length === 1 ? `“${dupes[0].filename}” has the same content as a document you already have.` : "Their content matches documents you already have.",
        tone: "info",
      });
    }
    onUploaded?.();
  };

  const addUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      new URL(url);
    } catch {
      toast({ title: "Enter a full URL, including https://", tone: "error" });
      return;
    }
    try {
      await services.library.addUrl(url, { projectId });
    } catch (err) {
      toast({ title: "Couldn't add that website", description: err instanceof Error ? err.message : undefined, tone: "error" });
      return;
    }
    setUrl("");
    setUrlMode(false);
    toast({ title: "Website added", description: "Pramaan is reading the page.", tone: "info" });
    onUploaded?.();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void handle([...e.dataTransfer.files]);
      }}
      className={cn(
        "relative rounded-2xl border border-dashed transition-[border-color,background-color] duration-200",
        over ? "border-accent bg-sage-soft/60" : "border-line-strong bg-surface/60",
        compact ? "p-5" : "p-8 sm:p-10",
      )}
    >
      <input ref={input} type="file" accept={UPLOAD_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => (void handle([...(e.target.files ?? [])]), (e.target.value = ""))} />
      <div className={cn("flex items-center gap-5", compact ? "flex-row" : "flex-col text-center")}>
        <motion.span animate={{ y: over ? -4 : 0, scale: over ? 1.05 : 1 }} className="grid place-items-center size-12 rounded-xl border border-line bg-raised text-ink-muted shadow-xs shrink-0">
          <UploadCloud className="size-5" strokeWidth={1.6} />
        </motion.span>
        <div className={cn(compact && "flex-1")}>
          <p className="text-[15px] font-medium text-ink">{over ? "Drop to upload" : "Drop files to add them to your library"}</p>
          <p className="mt-1 text-[13px] text-ink-muted">{UPLOAD_HINT} · stays private to you</p>
        </div>
        {urlMode ? (
          <form onSubmit={addUrl} className="flex gap-2 w-full max-w-md">
            <label htmlFor="add-url" className="sr-only">
              Website URL
            </label>
            <Input id="add-url" autoFocus type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" leading={<Link2 className="size-4" />} />
            <Button type="submit" disabled={!url}>
              Add
            </Button>
          </form>
        ) : (
          <div className="flex gap-2">
            <Button onClick={() => input.current?.click()}>Choose files</Button>
            <Button variant="secondary" leading={<Link2 className="size-4" />} onClick={() => setUrlMode(true)}>
              Add website
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
