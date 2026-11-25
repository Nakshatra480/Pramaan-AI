/** Research session types. Mirrors `research_sessions`, `research_steps`, `claims`, `citations` (PRD §21–§25). */
import type { Evidence, Source, SourceType } from "./source";

export type ResearchMode = "quick" | "standard" | "deep";
export type SourceChannel = "web" | "academic" | "project" | "library";

export type ResearchStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "timeout"
  | "no_sources";

export type ResearchStepId =
  | "understanding"
  | "planning"
  | "searching"
  | "reading"
  | "retrieving"
  | "cross_checking"
  | "verifying"
  | "synthesizing"
  | "citing";

export type StepStatus = "pending" | "active" | "complete" | "skipped";

export interface ResearchStep {
  id: ResearchStepId;
  label: string;
  status: StepStatus;
  /** User-facing artifact summary — never hidden reasoning (PRD §5.2). */
  detail?: string;
}

export type ClaimStatus = "supported" | "partially_supported" | "unsupported" | "insufficient_evidence";

export interface Claim {
  id: string;
  text: string;
  status: ClaimStatus;
  confidence: number;
  sourceIds: string[];
  evidenceIds: string[];
}

/** A citation maps a display number ([1]) to a deterministic internal source id (S1). */
export interface Citation {
  index: number;
  sourceId: string;
}

/**
 * Rich text uses inline markers: `[n]` for citations, `{{claim:c3}}` is not used —
 * claims are associated structurally so text stays plain & portable.
 */
export type RichText = string;

export interface KeyFinding {
  title: string;
  body: RichText;
  claimIds?: string[];
}

export interface ReportSection {
  heading: string;
  paragraphs: RichText[];
}

export interface ResearchReport {
  summary: RichText[];
  findings: KeyFinding[];
  analysis: ReportSection[];
  limitations: RichText[];
  /** Ordered: citations[i].index === i + 1 */
  citations: Citation[];
}

/** A source cited by a follow-up answer — `[n]` in the answer is `sources[n - 1]`. */
export interface FollowUpSource {
  title: string;
  url: string;
  domain: string;
  publisher: string;
  type: SourceType;
  publishedAt?: string | null;
  authors: string[];
  /** Where it came from: the report's own sources, or a fresh web (Tavily) / scholarly (OpenAlex) search. */
  origin: "report" | "web" | "academic" | "wikipedia";
  /** Set when it is one of the report's sources (opens in the side panel). */
  sourceId?: string | null;
}

export interface FollowUp {
  id: string;
  question: string;
  createdAt: string;
  status: "running" | "complete" | "failed";
  answer: RichText[];
  /**
   * "answer": a question answered from the report plus a fresh search.
   * "revision": a request to change the report — regenerated as a new research (`revisionId`); the original is untouched.
   */
  kind?: "answer" | "revision";
  revisionId?: string | null;
  sources?: FollowUpSource[];
}

export interface ResearchMetrics {
  sources: number;
  evidence: number;
  candidateClaims: number;
  verifiedClaims: number;
}

export interface Research {
  id: string;
  title: string;
  query: string;
  mode: ResearchMode;
  channels: SourceChannel[];
  projectId: string | null;
  status: ResearchStatus;
  createdAt: string;
  completedAt?: string;
  saved: boolean;
  shareId?: string;
  visibility: "private" | "link";
  metrics: ResearchMetrics;
  sourceIds: string[];
  evidence: Evidence[];
  claims: Claim[];
  report?: ResearchReport;
  followUps: FollowUp[];
  /** True when the UI is showing a sample report because no backend is connected. */
  preview?: boolean;
  topic?: string;
  /** Source records embedded by the API (cited first, in citation order). */
  sources?: Source[];
  /** Persisted step states from the backend. */
  steps?: ResearchStep[];
  progress?: number;
  errorCode?: string | null;
  /** On a revision: the research it regenerates, and the changes that were asked for. */
  parentId?: string | null;
  revisionInstructions?: string | null;
}

export interface ResearchInput {
  query: string;
  mode: ResearchMode;
  channels: SourceChannel[];
  projectId: string | null;
}

/** Streamed progress event (future: SSE from FastAPI/LangGraph). */
export interface ResearchProgressEvent {
  researchId: string;
  steps: ResearchStep[];
  metrics: ResearchMetrics;
  discoveredSourceIds: string[];
  status: ResearchStatus;
  /** 0–1 */
  progress: number;
}

export type { Source, Evidence };
