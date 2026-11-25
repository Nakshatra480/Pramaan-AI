import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiStream: vi.fn(),
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

const { apiResearchService: svc, clearResearchCache } = await import("@/lib/api/research");

const dto = (id: string, title = "Report") => ({
  id,
  title,
  query: title,
  mode: "standard",
  channels: ["web"],
  projectId: null,
  status: "completed",
  createdAt: "2026-11-25T00:00:00Z",
  completedAt: null,
  saved: false,
  shareId: null,
  visibility: "private",
  metrics: { sources: 0, evidence: 0, candidateClaims: 0, verifiedClaims: 0 },
  errorCode: null,
  sources: [],
  sourceIds: [],
  steps: [],
  progress: 1,
  evidence: [],
  claims: [],
  report: null,
  followUps: [],
});

describe("research detail cache", () => {
  beforeEach(() => {
    clearResearchCache();
    apiFetch.mockReset();
  });

  it("serves a report loaded earlier instantly and refreshes it on the next get", async () => {
    apiFetch.mockResolvedValueOnce(dto("a", "First"));
    expect(svc.peek("a")).toBeUndefined();
    await svc.get("a");
    expect(svc.peek("a")?.title).toBe("First");
    apiFetch.mockResolvedValueOnce(dto("a", "Renamed"));
    await svc.get("a");
    expect(svc.peek("a")?.title).toBe("Renamed");
  });

  it("lets the page adopt a hover prefetch instead of asking twice", async () => {
    apiFetch.mockResolvedValue(dto("b"));
    svc.prefetch("b");
    svc.prefetch("b"); // repeated hovers don't refetch
    const r = await svc.get("b");
    expect(r?.id).toBe("b");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("forgets deleted reports and everything on sign-out", async () => {
    apiFetch.mockResolvedValue(dto("c"));
    await svc.get("c");
    await svc.remove("c");
    expect(svc.peek("c")).toBeUndefined();
    await svc.get("c");
    clearResearchCache();
    expect(svc.peek("c")).toBeUndefined();
  });
});
