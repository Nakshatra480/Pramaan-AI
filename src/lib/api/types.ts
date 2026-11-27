/** Wire types returned by the FastAPI backend (camelCase). */
import type { ActivityKind, ClaimStatus, DocumentKind, FollowUpSource, IndexingStage, ProjectIcon, ProjectRole, ResearchMode, SourceChannel, SourceType } from "@/types";

export type BackendResearchStatus =
  | "queued"
  | "planning"
  | "searching"
  | "retrieving"
  | "extracting"
  | "verifying"
  | "synthesizing"
  | "citing"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface MeDTO {
  id: string;
  firebaseUid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  authProvider: string;
  plan: string;
  onboarded: boolean;
  preferences: Record<string, unknown>;
  createdAt: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  description: string;
  icon: ProjectIcon;
  ownerId: string;
  ownerName: string;
  role: ProjectRole;
  members: { userId: string; name: string; role: ProjectRole; initials: string }[];
  createdAt: string;
  updatedAt: string;
  researchCount: number;
  documentIds: string[];
  instructions: string;
  visibility: "private" | "link";
}

export interface ActivityDTO {
  id: string;
  projectId: string | null;
  kind: ActivityKind;
  actor: string;
  title: string;
  detail: string | null;
  href: string | null;
  createdAt: string;
}

export interface DocumentDTO {
  id: string;
  title: string;
  filename: string;
  kind: DocumentKind;
  sizeBytes: number;
  author: string | null;
  source: string | null;
  publishedAt: string | null;
  addedAt: string;
  status: IndexingStage;
  progress: number | null;
  pages: number | null;
  chunks: number | null;
  collectionIds: string[];
  projectIds: string[];
  summary: string;
  error: string | null;
  /** Non-fatal note, e.g. indexed for keyword search only. */
  warning?: string | null;
  /** Upload responses only: identical content was already in the library. */
  duplicate?: boolean;
  content?: { heading?: string | null; paragraphs: string[] }[];
}

export interface CollectionDTO {
  id: string;
  name: string;
  description: string | null;
  documentIds: string[];
}

export interface MetricsDTO {
  sources: number;
  evidence: number;
  candidateClaims: number;
  verifiedClaims: number;
}

export interface StepDTO {
  id: string;
  label: string;
  status: "pending" | "active" | "complete" | "skipped" | "failed";
  detail: string | null;
}

export interface SourceDTO {
  id: string;
  title: string;
  domain: string;
  url: string;
  publisher: string;
  authors: string[];
  publishedAt: string | null;
  type: SourceType;
  relevance: number;
  doi: string | null;
  abstract: string | null;
}

export interface ResearchSummaryDTO {
  id: string;
  title: string;
  query: string;
  mode: ResearchMode;
  channels: SourceChannel[];
  projectId: string | null;
  status: BackendResearchStatus;
  createdAt: string;
  completedAt: string | null;
  saved: boolean;
  visibility: "private" | "link";
  shareId: string | null;
  metrics: MetricsDTO;
  errorCode: string | null;
  parentId?: string | null;
  revisionInstructions?: string | null;
}

/** A report block as the API sends it: every field present, unused ones null. */
export interface ReportBlockDTO {
  type: "paragraph" | "list" | "table" | "diagram" | "figure";
  text: string | null;
  items: string[] | null;
  caption: string | null;
  columns: string[] | null;
  rows: string[][] | null;
  code: string | null;
  url: string | null;
  credit: string | null;
  sourceUrl: string | null;
  sourceIndex: number | null;
}

export interface ReportDTO {
  format?: "legacy" | "paper";
  title?: string | null;
  keywords?: string[];
  summary: string[];
  findings: { title: string; body: string; claimIds: string[] }[];
  analysis: { heading: string; paragraphs: string[] }[];
  sections?: { heading: string; blocks: ReportBlockDTO[] }[];
  limitations: string[];
  citations: { index: number; sourceId: string }[];
}

export interface ResearchDTO extends ResearchSummaryDTO {
  steps: StepDTO[];
  sources: SourceDTO[];
  sourceIds: string[];
  evidence: { id: string; sourceId: string; passage: string; relevance: number; location: string | null }[];
  claims: { id: string; text: string; status: ClaimStatus; confidence: number; sourceIds: string[]; evidenceIds: string[] }[];
  report: ReportDTO | null;
  followUps: {
    id: string;
    question: string;
    createdAt: string;
    status: "running" | "complete" | "failed";
    answer: string[];
    kind?: "answer" | "revision";
    revisionId?: string | null;
    sources?: FollowUpSource[];
  }[];
  progress: number;
}

export interface ProgressEventDTO {
  type: string;
  status: BackendResearchStatus;
  message: string;
  progress: number;
  steps: StepDTO[];
  metrics: MetricsDTO;
  sourceIds: string[];
}
