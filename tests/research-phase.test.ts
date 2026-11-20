import { describe, expect, it } from "vitest";
import { canLeaveLoading, nextPhase, type ResearchPhase } from "@/lib/utils/research-phase";
import type { ResearchStatus } from "@/types";

/** Applies nextPhase until it settles, like the component's effect does across renders. */
function settle(phase: ResearchPhase | null, status: ResearchStatus | undefined, signal: boolean) {
  let p = phase;
  for (let i = 0; i < 5; i++) {
    const n = nextPhase(p, status, signal);
    if (n === p) return p;
    p = n;
  }
  return p;
}

describe("research phase", () => {
  it("starts on the loading screen while running, and on results when already finished", () => {
    expect(nextPhase(null, undefined, false)).toBeNull();
    expect(nextPhase(null, "running", false)).toBe("progress");
    expect(nextPhase(null, "complete", false)).toBe("report");
    expect(nextPhase(null, "failed", false)).toBe("report");
  });

  it("moves to resolving on the stream's completion signal even while the fetched session is stale", () => {
    expect(settle("progress", "running", true)).toBe("resolving");
  });

  it("moves to resolving when a refetch shows completion even if the stream never delivered it", () => {
    expect(settle("progress", "complete", false)).toBe("resolving");
  });

  it("regression: a stale 'running' session never sends the screen back to loading after completion", () => {
    // Old behaviour: a fixed 1.9 s timer switched to "report" while the session still read "running",
    // and the retry rule then sent the page back to the loading screen forever.
    expect(settle("resolving", "running", true)).toBe("resolving");
    expect(canLeaveLoading("running", false)).toBe(false);
  });

  it("leaves the loading screen only once the fetched session is finished and has its report", () => {
    expect(canLeaveLoading(undefined, false)).toBe(false);
    expect(canLeaveLoading("complete", false)).toBe(false);
    expect(canLeaveLoading("complete", true)).toBe(true);
    expect(canLeaveLoading("failed", false)).toBe(true);
    expect(canLeaveLoading("no_sources", false)).toBe(true);
    expect(canLeaveLoading("timeout", false)).toBe(true);
  });

  it("a genuine retry from the results or error screen returns to loading", () => {
    expect(nextPhase("report", "running", false)).toBe("progress");
  });

  it("failures while loading stay on the progress phase (the view renders the error state)", () => {
    expect(settle("progress", "failed", false)).toBe("progress");
  });
});
