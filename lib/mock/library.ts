import type { Collection, LibraryDocument, LibraryFilter, UploadedDocument } from "@/types";
import { INDEXING_STAGES } from "@/lib/constants";
import { matchesLibraryFilter } from "@/lib/utils/library";
import { db, latency, uid } from "./db";


const STAGE_MS = [900, 1100, 900, 1600, 900];


function kindFromName(name: string): LibraryDocument["kind"] {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "md") return "markdown";
  if (ext === "txt") return "txt";
  if (name.startsWith("http")) return "website";
  return "txt";
}

/** Drives a document through the indexing pipeline (PRD §38). */
function runIndexing(id: string, shouldFail = false) {
  let stage = 0;
  const advance = () => {
    stage += 1;
    db.write((d) => {
      const doc = d.documents.find((x) => x.id === id);
      if (!doc) return;
      if (shouldFail && stage === 2) {
        doc.status = "failed";
        doc.error = "Pramaan couldn't extract text from this file. It may be scanned or corrupted.";
        return;
      }
      const next = INDEXING_STAGES[stage];
      doc.status = next.id;
      doc.progress = stage / (INDEXING_STAGES.length - 1);
      if (next.id === "ready") {
        doc.chunks = Math.max(8, Math.round(doc.sizeBytes / 14_000));
        doc.pages = doc.kind === "pdf" || doc.kind === "paper" ? Math.max(1, Math.round(doc.sizeBytes / 90_000)) : undefined;
        d.activity.unshift({
          id: uid("a"),
          projectId: doc.projectIds[0] ?? null,
          kind: "document_added",
          actor: "You",
          title: `Added “${doc.filename}”`,
          detail: `Indexed · ${doc.chunks} chunks`,
          href: `/library/${doc.id}`,
          createdAt: new Date().toISOString(),
        });
      }
    });
    const doc = db.read().documents.find((x) => x.id === id);
    if (doc && doc.status !== "ready" && doc.status !== "failed") setTimeout(advance, STAGE_MS[stage] ?? 900);
  };
  setTimeout(advance, STAGE_MS[0]);
}

export const libraryService = {
  async list(opts: { filter?: LibraryFilter; projectId?: string; collectionId?: string; query?: string } = {}): Promise<LibraryDocument[]> {
    await latency(260);
    const q = opts.query?.trim().toLowerCase();
    return db
      .read()
      .documents.filter((d) => matchesLibraryFilter(d, opts.filter ?? "all"))
      .filter((d) => (opts.projectId ? d.projectIds.includes(opts.projectId) : true))
      .filter((d) => (opts.collectionId ? d.collectionIds.includes(opts.collectionId) : true))
      .filter((d) => (q ? `${d.title} ${d.filename} ${d.author ?? ""} ${d.summary}`.toLowerCase().includes(q) : true))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  },

  async get(id: string): Promise<LibraryDocument | null> {
    await latency(200);
    return db.read().documents.find((d) => d.id === id) ?? null;
  },

  async collections(): Promise<Collection[]> {
    await latency(120);
    return db.read().collections;
  },

  async createCollection(name: string): Promise<Collection> {
    await latency(200);
    const c: Collection = { id: uid("col"), name: name.trim(), documentIds: [] };
    db.write((d) => {
      d.collections.push(c);
    });
    return c;
  },

  /** Upload metadata only in the UI phase — no file bytes leave the browser. */
  async upload(files: { name: string; size: number }[], opts: { projectId?: string } = {}): Promise<UploadedDocument[]> {
    await latency(150);
    const now = new Date().toISOString();
    const docs: LibraryDocument[] = files.map((f) => ({
      id: uid("d"),
      title: f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "),
      filename: f.name,
      kind: kindFromName(f.name),
      sizeBytes: f.size || 480_000,
      author: "You",
      source: "Uploaded",
      addedAt: now,
      status: "uploading",
      progress: 0,
      collectionIds: [],
      projectIds: opts.projectId ? [opts.projectId] : [],
      summary: "Uploaded document. Pramaan will use it as private evidence once indexing completes.",
      content: [
        {
          heading: "Preview",
          paragraphs: [
            "In this preview build, document contents stay in your browser and are not parsed. Once the Document Service is connected, extracted text appears here with page references for every passage Pramaan cites.",
          ],
        },
      ],
    }));
    db.write((d) => {
      d.documents.unshift(...docs);
      if (opts.projectId) {
        const p = d.projects.find((x) => x.id === opts.projectId);
        p?.documentIds.push(...docs.map((x) => x.id));
      }
    });
    docs.forEach((doc) => runIndexing(doc.id, /corrupt|scan/i.test(doc.filename)));
    return docs.map((d) => ({ ...d, duplicate: false }));
  },

  async addUrl(url: string, opts: { projectId?: string } = {}): Promise<LibraryDocument> {
    let name = url;
    try {
      const u = new URL(url);
      name = `${u.hostname}${u.pathname === "/" ? "" : u.pathname}`;
    } catch {
      /* keep raw */
    }
    const [doc] = await this.upload([{ name: `http://${name}`, size: 60_000 }], opts);
    db.write((d) => {
      const x = d.documents.find((y) => y.id === doc.id);
      if (x) {
        x.kind = "website";
        x.title = name;
        x.filename = name;
        x.source = name.split("/")[0];
      }
    });
    return doc;
  },

  /** Demo mode has no original bytes; export the readable text instead. */
  async download(doc: LibraryDocument): Promise<{ blob: Blob; filename: string }> {
    const text = [doc.title, "", ...doc.content.flatMap((s) => [s.heading ?? "", ...s.paragraphs, ""])].join("\n");
    return { blob: new Blob([text], { type: "text/plain" }), filename: `${doc.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt` };
  },
  async retry(id: string) {
    await latency(150);
    db.write((d) => {
      const doc = d.documents.find((x) => x.id === id);
      if (doc) {
        doc.status = "uploading";
        doc.progress = 0;
        doc.error = undefined;
      }
    });
    runIndexing(id);
  },

  async remove(id: string) {
    await latency(200);
    db.write((d) => {
      d.documents = d.documents.filter((x) => x.id !== id);
      d.projects.forEach((p) => (p.documentIds = p.documentIds.filter((x) => x !== id)));
      d.collections.forEach((c) => (c.documentIds = c.documentIds.filter((x) => x !== id)));
    });
  },

  async addToProject(id: string, projectId: string) {
    await latency(220);
    db.write((d) => {
      const doc = d.documents.find((x) => x.id === id);
      const p = d.projects.find((x) => x.id === projectId);
      if (!doc || !p) return;
      if (!doc.projectIds.includes(projectId)) doc.projectIds.push(projectId);
      if (!p.documentIds.includes(id)) p.documentIds.push(id);
    });
  },

  async removeFromProject(id: string, projectId: string) {
    await latency(200);
    db.write((d) => {
      const doc = d.documents.find((x) => x.id === id);
      const p = d.projects.find((x) => x.id === projectId);
      if (doc) doc.projectIds = doc.projectIds.filter((x) => x !== projectId);
      if (p) p.documentIds = p.documentIds.filter((x) => x !== id);
    });
  },

  async addToCollection(id: string, collectionId: string) {
    await latency(160);
    db.write((d) => {
      const doc = d.documents.find((x) => x.id === id);
      const c = d.collections.find((x) => x.id === collectionId);
      if (!doc || !c) return;
      if (!doc.collectionIds.includes(collectionId)) doc.collectionIds.push(collectionId);
      if (!c.documentIds.includes(id)) c.documentIds.push(id);
    });
  },
};
