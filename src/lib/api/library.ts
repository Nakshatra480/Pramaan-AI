import type { Collection, LibraryDocument, LibraryFilter, UploadedDocument } from "@/types";
import { apiDownload, apiFetch } from "./client";
import { apiEvents, scheduleRefresh } from "./events";
import type { CollectionDTO, DocumentDTO } from "./types";

const PROCESSING = new Set(["uploading", "extracting", "chunking", "embedding", "indexing"]);

const toDoc = (d: DocumentDTO): LibraryDocument => ({
  id: d.id,
  title: d.title,
  filename: d.filename,
  kind: d.kind,
  sizeBytes: d.sizeBytes,
  author: d.author ?? undefined,
  source: d.source ?? undefined,
  publishedAt: d.publishedAt ?? undefined,
  addedAt: d.addedAt,
  status: d.status,
  progress: d.progress ?? undefined,
  pages: d.pages ?? undefined,
  chunks: d.chunks ?? undefined,
  collectionIds: d.collectionIds,
  projectIds: d.projectIds,
  summary: d.summary,
  content: (d.content ?? []).map((s) => ({ heading: s.heading ?? undefined, paragraphs: s.paragraphs })),
  error: d.error ?? undefined,
  warning: d.warning ?? undefined,
});

/**
 * Indexing is backend-authoritative: poll while a document is still processing, backing off as it
 * ages and stopping after 20 minutes — the backend sweep fails abandoned jobs, and the next visit
 * or action refetches (audit H-04). Returns the delay used, or null when not polling.
 */
export function pollDelay(docs: Pick<LibraryDocument, "status" | "addedAt">[], now = Date.now()): number | null {
  const ages = docs.filter((d) => PROCESSING.has(d.status)).map((d) => now - new Date(d.addedAt).getTime());
  if (!ages.length) return null;
  const youngest = Math.min(...ages);
  if (youngest < 60_000) return 1500;
  if (youngest < 5 * 60_000) return 5000;
  if (youngest < 20 * 60_000) return 15_000;
  return null;
}

function pollIfProcessing(docs: LibraryDocument[]) {
  const ms = pollDelay(docs);
  if (ms !== null) scheduleRefresh(ms);
}

export const apiLibraryService = {
  async list(opts: { filter?: LibraryFilter; projectId?: string; collectionId?: string; query?: string } = {}): Promise<LibraryDocument[]> {
    const docs = (
      await apiFetch<DocumentDTO[]>("/library", { query: { filter: opts.filter, projectId: opts.projectId, collectionId: opts.collectionId, q: opts.query } })
    ).map(toDoc);
    pollIfProcessing(docs);
    return docs;
  },
  async get(id: string): Promise<LibraryDocument | null> {
    try {
      const doc = toDoc(await apiFetch<DocumentDTO>(`/library/${id}`));
      pollIfProcessing([doc]);
      return doc;
    } catch (e) {
      if ((e as { status?: number }).status === 404 || (e as { status?: number }).status === 422) return null;
      throw e;
    }
  },
  async collections(): Promise<Collection[]> {
    return (await apiFetch<CollectionDTO[]>("/library/collections")).map((c) => ({ ...c, description: c.description ?? undefined }));
  },
  async createCollection(name: string): Promise<Collection> {
    const c = await apiFetch<CollectionDTO>("/library/collections", { method: "POST", body: { name } });
    apiEvents.notify();
    return { ...c, description: c.description ?? undefined };
  },
  async upload(files: (File | { name: string; size: number })[], opts: { projectId?: string } = {}): Promise<UploadedDocument[]> {
    const out: UploadedDocument[] = [];
    for (const f of files) {
      if (!(f instanceof File)) continue;
      const form = new FormData();
      form.append("file", f, f.name);
      if (opts.projectId) form.append("projectId", opts.projectId);
      const d = await apiFetch<DocumentDTO>("/library/upload", { method: "POST", body: form });
      out.push({ ...toDoc(d), duplicate: Boolean(d.duplicate) });
    }
    apiEvents.notify();
    return out;
  },
  async addUrl(url: string, opts: { projectId?: string } = {}) {
    const d = toDoc(await apiFetch<DocumentDTO>("/library/urls", { method: "POST", body: { url, projectId: opts.projectId } }));
    apiEvents.notify();
    return d;
  },
  /** Original file, streamed by the API after an ownership check. */
  async download(doc: LibraryDocument): Promise<{ blob: Blob; filename: string }> {
    if (doc.kind === "website") throw new Error("Websites have no original file to download.");
    return apiDownload(`/library/${doc.id}/download`);
  },
  async retry(id: string) {
    await apiFetch(`/library/${id}/retry`, { method: "POST" });
    apiEvents.notify();
  },
  async remove(id: string) {
    await apiFetch(`/library/${id}`, { method: "DELETE" });
    apiEvents.notify();
  },
  async addToProject(id: string, projectId: string) {
    await apiFetch(`/projects/${projectId}/documents/${id}`, { method: "POST" });
    apiEvents.notify();
  },
  async removeFromProject(id: string, projectId: string) {
    await apiFetch(`/projects/${projectId}/documents/${id}`, { method: "DELETE" });
    apiEvents.notify();
  },
  async addToCollection(id: string, collectionId: string) {
    await apiFetch(`/library/collections/${collectionId}/documents/${id}`, { method: "POST" });
    apiEvents.notify();
  },
};
