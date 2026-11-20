import type { Research, ResearchInput, ResearchProgressEvent, ResearchStatus, ResearchStep, ResearchStepId } from "@/types";
import { ApiError, apiFetch, apiStream } from "./client";
import { apiEvents, scheduleRefresh } from "./events";
import { rememberSources, toSource } from "./sources";
import type { BackendResearchStatus, ProgressEventDTO, ResearchDTO, ResearchSummaryDTO, StepDTO } from "./types";

/** Backend state machine → the UI's coarser research states. */
export function toUiStatus(status: BackendResearchStatus, errorCode?: string | null): ResearchStatus {
  switch (status) {
    case "completed":
      return "complete";
    case "failed":
      return errorCode === "NO_SOURCES" ? "no_sources" : errorCode === "TIMEOUT" ? "timeout" : "failed";
    case "cancelled":
      return "failed";
    case "interrupted":
      return "running"; // transient: the server requeues it automatically
    case "queued":
      return "running";
    default:
      return "running";
  }
}

const toSteps = (steps: StepDTO[]): ResearchStep[] =>
  steps.map((s) => ({ id: s.id as ResearchStepId, label: s.label, status: s.status === "failed" ? "pending" : s.status, detail: s.detail ?? undefined }));

function fromSummary(r: ResearchSummaryDTO): Research {
  return {
    id: r.id,
    title: r.title,
    query: r.query,
    mode: r.mode,
    channels: r.channels,
    projectId: r.projectId,
    status: toUiStatus(r.status, r.errorCode),
    createdAt: r.createdAt,
    completedAt: r.completedAt ?? undefined,
    saved: r.saved,
    shareId: r.shareId ?? undefined,
    visibility: r.visibility,
    metrics: r.metrics,
    sourceIds: [],
    evidence: [],
    claims: [],
    followUps: [],
    errorCode: r.errorCode,
  };
}

function fromDetail(r: ResearchDTO): Research {
  const sources = r.sources.map(toSource);
  rememberSources(sources);
  return {
    ...fromSummary(r),
    sources,
    sourceIds: r.sourceIds,
    steps: toSteps(r.steps),
    progress: r.progress,
    evidence: r.evidence.map((e) => ({ id: e.id, sourceId: e.sourceId, passage: e.passage, relevance: e.relevance, location: e.location ?? undefined })),
    claims: r.claims,
    report: r.report ?? undefined,
    followUps: r.followUps,
  };
}

const ESTIMATE_S: Record<Research["mode"], number> = { quick: 60, standard: 120, deep: 240 };

/** Open progress streams. While one is open it drives updates, so list polling pauses. */
let activeStreams = 0;

async function get(id: string): Promise<Research | null> {
  try {
    const r = fromDetail(await apiFetch<ResearchDTO>(`/research/${id}`));
    if (r.followUps.some((f) => f.status === "running")) scheduleRefresh(2000);
    return r;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 422)) return null;
    throw e;
  }
}

export const apiResearchService = {
  async list(filter: { projectId?: string | null } = {}): Promise<Research[]> {
    const rows = (await apiFetch<ResearchSummaryDTO[]>("/research", { query: { projectId: filter.projectId ?? undefined } })).map(fromSummary);
    // Poll for running sessions only when no live stream is already reporting their progress.
    if (activeStreams === 0 && rows.some((r) => r.status === "running")) scheduleRefresh(4000);
    return rows;
  },

  get,

  async getByShareId(token: string): Promise<Research | null> {
    try {
      return fromDetail(await apiFetch<ResearchDTO>(`/shared/${token}`, { auth: false }));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 422)) return null;
      throw e;
    }
  },

  async create(input: ResearchInput): Promise<Research> {
    const { researchId } = await apiFetch<{ researchId: string; status: string }>("/research", {
      method: "POST",
      body: { query: input.query, projectId: input.projectId, mode: input.mode, sources: input.channels },
    });
    apiEvents.notify();
    return {
      id: researchId,
      title: input.query,
      query: input.query,
      mode: input.mode,
      channels: input.channels,
      projectId: input.projectId,
      status: "running",
      createdAt: new Date().toISOString(),
      saved: false,
      visibility: "private",
      metrics: { sources: 0, evidence: 0, candidateClaims: 0, verifiedClaims: 0 },
      sourceIds: [],
      evidence: [],
      claims: [],
      followUps: [],
    };
  },

  /** SSE progress → the same ResearchProgressEvent the UI already renders. */
  stream(id: string, onEvent: (e: ResearchProgressEvent) => void): () => void {
    let closed = false;
    activeStreams += 1;
    const stop = apiStream(
      `/research/${id}/stream`,
      (_type, data) => {
        const e = data as ProgressEventDTO;
        if (closed) return;
        const status = toUiStatus(e.status);
        onEvent({ researchId: id, steps: toSteps(e.steps), metrics: e.metrics, discoveredSourceIds: e.sourceIds, status, progress: e.progress / 100 });
        if (status !== "running") apiEvents.notify(); // refetch the finished report / error state
      },
      () => apiEvents.notify(),
    );
    return () => {
      if (!closed) activeStreams -= 1;
      closed = true;
      stop();
    };
  },

  snapshot(r: Research): ResearchProgressEvent {
    return {
      researchId: r.id,
      steps: r.steps ?? [],
      metrics: r.metrics,
      discoveredSourceIds: r.sourceIds,
      status: r.status,
      progress: r.progress ?? (r.status === "complete" ? 1 : 0),
    };
  },

  estimatedSeconds: (r: Research) => ESTIMATE_S[r.mode],

  async retry(id: string): Promise<Research | null> {
    await apiFetch(`/research/${id}/retry`, { method: "POST" });
    apiEvents.notify();
    return get(id);
  },
  async setVisibility(id: string, visibility: Research["visibility"]): Promise<string | undefined> {
    const r = await apiFetch<{ visibility: string; shareId: string | null }>(`/research/${id}/share`, { method: "PUT", body: { visibility } });
    apiEvents.notify();
    return r.shareId ?? undefined;
  },
  async moveToProject(id: string, projectId: string | null) {
    await apiFetch(`/research/${id}`, { method: "PATCH", body: { projectId, moveProject: true } });
    apiEvents.notify();
  },
  async rename(id: string, title: string) {
    await apiFetch(`/research/${id}`, { method: "PATCH", body: { title } });
    apiEvents.notify();
  },
  async remove(id: string) {
    await apiFetch(`/research/${id}`, { method: "DELETE" });
    apiEvents.notify();
  },
  async removeAll() {
    await apiFetch("/research", { method: "DELETE", query: { confirm: "delete-all" } });
    apiEvents.notify();
  },
  async followUp(id: string, question: string): Promise<void> {
    await apiFetch(`/research/${id}/follow-ups`, { method: "POST", body: { question } });
    apiEvents.notify(); // shows the running follow-up; `get` keeps polling until it completes
  },
};
