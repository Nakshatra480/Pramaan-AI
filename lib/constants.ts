import type { IndexingStage } from "@/types";

/** Document processing pipeline stages (PRD §38). Shared by UI and services. */
export const INDEXING_STAGES: { id: IndexingStage; label: string }[] = [
  { id: "uploading", label: "Uploading" },
  { id: "extracting", label: "Extracting" },
  { id: "chunking", label: "Chunking" },
  { id: "embedding", label: "Generating embeddings" },
  { id: "indexing", label: "Indexing" },
  { id: "ready", label: "Ready" },
];
