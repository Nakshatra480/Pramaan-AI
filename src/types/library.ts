/** Library types. Mirrors `documents`, `collections`, `project_documents` (PRD §37–§40). */

export type DocumentKind = "pdf" | "docx" | "txt" | "markdown" | "paper" | "website" | "note";

export type IndexingStage = "uploading" | "extracting" | "chunking" | "embedding" | "indexing" | "ready" | "failed";

export interface LibraryDocument {
  id: string;
  title: string;
  filename: string;
  kind: DocumentKind;
  sizeBytes: number;
  author?: string;
  source?: string;
  publishedAt?: string;
  addedAt: string;
  status: IndexingStage;
  /** 0–1 during indexing */
  progress?: number;
  pages?: number;
  chunks?: number;
  collectionIds: string[];
  projectIds: string[];
  summary: string;
  /** Plain paragraphs used by the reader (content would stream from the Document Service). */
  content: { heading?: string; paragraphs: string[] }[];
  error?: string;
  /** Non-fatal note, e.g. indexed for keyword search only while semantic search was unavailable. */
  warning?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  documentIds: string[];
}

export type LibraryFilter = "all" | "pdf" | "documents" | "papers" | "websites";

/** Result of an upload: `duplicate` when identical content was already in the library (nothing new stored). */
export type UploadedDocument = LibraryDocument & { duplicate: boolean };
