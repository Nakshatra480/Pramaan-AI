/** Source & evidence types. Mirrors the future `sources` / `evidence` tables (PRD §21, §23). */

export type SourceType = "academic" | "web" | "news" | "documentation" | "report" | "library";

export interface Source {
  id: string;
  title: string;
  domain: string;
  url: string;
  publisher: string;
  authors?: string[];
  /** ISO date; absent when the publisher doesn't state one. */
  publishedAt?: string;
  type: SourceType;
  /** 0–1, from the reranker. */
  relevance: number;
  doi?: string;
  abstract?: string;
}

export interface Evidence {
  id: string;
  sourceId: string;
  /** Exact supporting passage (PRD §23 — retain verbatim). */
  passage: string;
  relevance: number;
  location?: string;
}
