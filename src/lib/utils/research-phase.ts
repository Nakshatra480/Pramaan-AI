import type { ResearchStatus } from "@/types";

/**
 * Which screen a research session shows:
 *  - "progress":  the post-prompt loading screen
 *  - "resolving": research has finished; the loading screen plays its closing moment
 *                 while the finished result is fetched
 *  - "report":    the results page (or the error state, if the session failed)
 */
export type ResearchPhase = "progress" | "resolving" | "report";

/**
 * Next phase from the current one and the latest known job state.
 * `completeSignal` is true once the live progress stream has reported completion — which can
 * arrive before the (slower) refetch of the session itself reflects it.
 */
export function nextPhase(phase: ResearchPhase | null, status: ResearchStatus | undefined, completeSignal: boolean): ResearchPhase | null {
  if (!status) return phase;
  if (phase === null) return status === "running" ? "progress" : "report";
  if (phase === "progress" && (completeSignal || status === "complete")) return "resolving";
  // Only reachable after the session was seen finished, so "running" here means a genuine retry.
  if (phase === "report" && status === "running") return "progress";
  return phase;
}

/**
 * Whether the results (or the failure state) can replace the loading screen: the fetched session
 * must itself be finished — and, when complete, carry its report. Until then we keep the loading
 * screen up and keep refetching, instead of flashing back to it.
 */
export function canLeaveLoading(status: ResearchStatus | undefined, hasReport: boolean): boolean {
  if (!status || status === "running") return false;
  return status !== "complete" || hasReport;
}
