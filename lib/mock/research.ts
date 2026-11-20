import type {
  ActivityItem,
  Research,
  ResearchInput,
  ResearchMetrics,
  ResearchProgressEvent,
  ResearchStep,
  ResearchStepId,
} from "@/types";
import { db, latency, uid } from "./db";

/**
 * Mock research engine. Simulates the LangGraph workflow (PRD §14) by deriving
 * progress from elapsed time, so leaving and returning to a running session
 * resumes naturally — the same behaviour a persisted backend run would have.
 */

export const STEP_DEFS: { id: ResearchStepId; label: string; at: number }[] = [
  { id: "understanding", label: "Understanding question", at: 0 },
  { id: "planning", label: "Planning research", at: 1 },
  { id: "searching", label: "Searching sources", at: 2 },
  { id: "reading", label: "Reading evidence", at: 4 },
  { id: "retrieving", label: "Retrieving knowledge", at: 5.5 },
  { id: "cross_checking", label: "Cross-checking claims", at: 6.5 },
  { id: "verifying", label: "Verifying evidence", at: 8 },
  { id: "synthesizing", label: "Synthesizing answer", at: 10 },
  { id: "citing", label: "Attaching citations", at: 12 },
];
const TOTAL_SECONDS = 13.5;
const MODE_SCALE: Record<Research["mode"], number> = { quick: 0.7, standard: 1, deep: 1.3 };

function duration(r: Research) {
  return TOTAL_SECONDS * MODE_SCALE[r.mode];
}

const STOPWORDS = new Set(
  "the a an of in on and or for to with what how are is do does did can will when why which latest between compared versus vs about from into their there this that we our need".split(" "),
);
function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Pick the best-matching completed session to use as simulated output. */
function matchTemplate(query: string): { template: Research; exact: boolean } {
  const q = new Set(tokens(query));
  const pool = db.read().research.filter((r) => r.status === "complete" && r.report && !r.preview);
  let best = pool[0];
  let bestScore = -1;
  for (const r of pool) {
    const t = new Set(tokens(`${r.query} ${r.title} ${r.topic ?? ""}`));
    let score = 0;
    q.forEach((w) => {
      if (t.has(w)) score += 1;
      else if ([...t].some((x) => x.startsWith(w.slice(0, 5)) && w.length > 4)) score += 0.5;
    });
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return { template: best, exact: bestScore >= 1.5 };
}

function titleFromQuery(query: string) {
  const q = query.trim().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  return q.charAt(0).toUpperCase() + q.slice(1);
}

function clampMetrics(target: ResearchMetrics, t: number): ResearchMetrics {
  const ramp = (start: number, end: number) => Math.max(0, Math.min(1, (t - start) / (end - start)));
  return {
    sources: Math.round(target.sources * ramp(2, 5)),
    evidence: Math.round(target.evidence * ramp(4, 7)),
    candidateClaims: Math.round(target.candidateClaims * ramp(6.5, 8)),
    verifiedClaims: Math.round(target.verifiedClaims * ramp(8, 10)),
  };
}

function stepDetail(id: ResearchStepId, r: Research, m: ResearchMetrics): string | undefined {
  const hasPrivate = r.channels.includes("project") || r.channels.includes("library");
  switch (id) {
    case "understanding":
      return "Identified the core question and scope";
    case "planning":
      return `${r.mode === "deep" ? 7 : r.mode === "standard" ? 5 : 3} research directions planned`;
    case "searching":
      return `Searching ${r.channels.filter((c) => c === "web" || c === "academic").join(" and ") || "selected"} sources · ${m.sources} found`;
    case "reading":
      return `${m.evidence} evidence passages extracted`;
    case "retrieving":
      return hasPrivate ? "Searching your private library" : "No private library selected";
    case "cross_checking":
      return `${m.candidateClaims} candidate claims compared across sources`;
    case "verifying":
      return `${m.verifiedClaims} of ${r.metrics.candidateClaims} claims supported`;
    case "synthesizing":
      return "Writing the research report";
    case "citing":
      return `Mapping passages to ${r.sourceIds.length} cited sources`;
  }
}

export function computeProgress(r: Research, now = Date.now()): ResearchProgressEvent {
  const scale = MODE_SCALE[r.mode];
  const done = r.status !== "running" && r.status !== "queued";
  const elapsed = done ? Infinity : (now - new Date(r.createdAt).getTime()) / 1000 / scale;
  const t = Math.min(elapsed, TOTAL_SECONDS);
  const metrics = done ? r.metrics : clampMetrics(r.metrics, t);
  const hasPrivate = r.channels.includes("project") || r.channels.includes("library");

  const steps: ResearchStep[] = STEP_DEFS.map((def, i) => {
    const next = STEP_DEFS[i + 1]?.at ?? TOTAL_SECONDS;
    let status: ResearchStep["status"] = t >= next ? "complete" : t >= def.at ? "active" : "pending";
    if (def.id === "retrieving" && !hasPrivate && status !== "pending") status = "skipped";
    return { id: def.id, label: def.label, status, detail: status === "pending" ? undefined : stepDetail(def.id, r, metrics) };
  });

  const revealCount = Math.round(r.sourceIds.length * Math.max(0, Math.min(1, (t - 2) / 3)));
  return {
    researchId: r.id,
    steps,
    metrics,
    discoveredSourceIds: done ? r.sourceIds : r.sourceIds.slice(0, revealCount),
    status: t >= TOTAL_SECONDS && !done ? "complete" : r.status,
    progress: done ? 1 : t / TOTAL_SECONDS,
  };
}

function recordActivity(item: Omit<ActivityItem, "id" | "createdAt">) {
  db.write((d) => {
    d.activity.unshift({ ...item, id: uid("a"), createdAt: new Date().toISOString() });
  });
}

export const researchService = {
  async list(filter: { projectId?: string | null } = {}): Promise<Research[]> {
    await latency(220);
    return db
      .read()
      .research.filter((r) => (filter.projectId === undefined ? true : r.projectId === filter.projectId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<Research | null> {
    await latency(180);
    return db.read().research.find((r) => r.id === id) ?? null;
  },

  async getByShareId(shareId: string): Promise<Research | null> {
    await latency(260);
    return db.read().research.find((r) => r.shareId === shareId && r.visibility === "link") ?? null;
  },

  async create(input: ResearchInput): Promise<Research> {
    await latency(160);
    const { template, exact } = matchTemplate(input.query);
    const research: Research = {
      id: uid("r"),
      title: titleFromQuery(input.query),
      query: input.query.trim(),
      mode: input.mode,
      channels: input.channels,
      projectId: input.projectId,
      status: "running",
      createdAt: new Date().toISOString(),
      saved: false,
      visibility: "private",
      metrics: template.metrics,
      sourceIds: template.sourceIds,
      evidence: template.evidence,
      claims: template.claims,
      report: undefined,
      followUps: [],
      preview: !exact,
      topic: template.topic,
    };
    // Report attaches on completion (see `complete`), keeping the template id for lookup.
    templates.set(research.id, template.id);
    db.write((d) => {
      d.research.unshift(research);
      if (input.projectId) {
        const p = d.projects.find((x) => x.id === input.projectId);
        if (p) {
          p.researchCount += 1;
          p.updatedAt = research.createdAt;
        }
      }
    });
    return research;
  },

  /**
   * Stream progress events — the future SSE/WebSocket boundary.
   * Returns an unsubscribe function.
   */
  stream(id: string, onEvent: (e: ResearchProgressEvent) => void): () => void {
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const r = db.read().research.find((x) => x.id === id);
      if (!r) return;
      const event = computeProgress(r);
      if (r.status === "running" && event.status === "complete") {
        complete(r.id);
        onEvent(computeProgress(db.read().research.find((x) => x.id === id)!));
        return;
      }
      onEvent(event);
      if (r.status === "running") timer = setTimeout(tick, 240);
    };
    let timer = setTimeout(tick, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  },

  /** Current progress snapshot without subscribing. */
  snapshot(r: Research): ResearchProgressEvent {
    return computeProgress(r);
  },

  estimatedSeconds(r: Research) {
    return Math.round(duration(r));
  },

  async retry(id: string): Promise<Research | null> {
    const r = db.read().research.find((x) => x.id === id);
    if (!r) return null;
    const template = matchTemplate(r.query);
    templates.set(id, template.template.id);
    db.write((d) => {
      const x = d.research.find((y) => y.id === id)!;
      Object.assign(x, {
        status: "running",
        createdAt: new Date().toISOString(),
        metrics: template.template.metrics,
        sourceIds: template.template.sourceIds,
        evidence: template.template.evidence,
        claims: template.template.claims,
        preview: !template.exact,
      });
    });
    await latency(120);
    return db.read().research.find((x) => x.id === id) ?? null;
  },


  async setVisibility(id: string, visibility: Research["visibility"]): Promise<string | undefined> {
    await latency(240);
    let shareId: string | undefined;
    db.write((d) => {
      const r = d.research.find((x) => x.id === id);
      if (!r) return;
      r.visibility = visibility;
      if (visibility === "link" && !r.shareId) r.shareId = uid("sh");
      shareId = r.shareId;
    });
    if (visibility === "link") {
      const r = db.read().research.find((x) => x.id === id);
      if (r) recordActivity({ projectId: r.projectId, kind: "research_shared", actor: "You", title: `Shared “${r.title}”`, detail: "Anyone with the link" });
    }
    return shareId;
  },

  async moveToProject(id: string, projectId: string | null) {
    await latency(200);
    db.write((d) => {
      const r = d.research.find((x) => x.id === id);
      if (r) r.projectId = projectId;
    });
  },

  async rename(id: string, title: string) {
    await latency(120);
    db.write((d) => {
      const r = d.research.find((x) => x.id === id);
      if (r) r.title = title;
    });
  },

  async remove(id: string) {
    await latency(200);
    db.write((d) => {
      d.research = d.research.filter((r) => r.id !== id);
    });
  },

  async removeAll() {
    await latency(300);
    db.write((d) => {
      d.research = d.research.filter((r) => r.status === "running");
    });
  },

  async followUp(id: string, question: string): Promise<void> {
    const fid = uid("f");
    db.write((d) => {
      const r = d.research.find((x) => x.id === id);
      r?.followUps.push({ id: fid, question, createdAt: new Date().toISOString(), status: "running", answer: [] });
    });
    await latency(4200);
    db.write((d) => {
      const r = d.research.find((x) => x.id === id);
      const f = r?.followUps.find((x) => x.id === fid);
      if (!r || !f) return;
      f.status = "complete";
      const cites = r.report?.citations ?? [];
      const c1 = cites[0] ? `[${cites[0].index}]` : "";
      const c2 = cites[1] ? `[${cites[1].index}]` : "";
      f.answer = [
        `Building on the evidence already collected for this research, Pramaan re-ranked ${Math.min(r.evidence.length, 9)} passages against your follow-up. The most relevant evidence is consistent with the original findings ${c1}${c2}.`,
        r.claims.some((c) => c.status === "insufficient_evidence")
          ? "Some parts of this question depend on claims marked as having insufficient evidence, so Pramaan has not presented them as established facts. Try Deep Research to broaden the search."
          : "No new contradictions were found. Deep Research can broaden discovery if you need additional sources.",
      ];
    });
  },
};

const templates = new Map<string, string>();

function complete(id: string) {
  db.write((d) => {
    const r = d.research.find((x) => x.id === id);
    if (!r || r.status !== "running") return;
    const templateId = templates.get(id);
    const template =
      d.research.find((x) => x.id === templateId && x.report) ??
      d.research.find((x) => x.status === "complete" && x.report && x.sourceIds.join() === r.sourceIds.join());
    r.status = "complete";
    r.completedAt = new Date().toISOString();
    r.report = template?.report ? structuredClone(template.report) : undefined;
    d.activity.unshift({
      id: uid("a"),
      projectId: r.projectId,
      kind: "research_completed",
      actor: "You",
      title: r.title,
      detail: `${r.metrics.sources} sources · ${r.metrics.verifiedClaims} verified claims`,
      href: `/research/${r.id}`,
      createdAt: r.completedAt,
    });
  });
}
