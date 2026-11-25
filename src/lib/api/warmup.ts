/**
 * Wakes the API (and its database) before the user needs it.
 *
 * On Render's free plan the API sleeps after ~15 idle minutes and takes 30–60 s to start, and Neon's
 * compute also scales to zero. Pages where a signed-in request is about to happen (landing, sign-in,
 * the workspace gate) call `prewarmBackend()` on mount, so the cold start overlaps with the user typing
 * instead of happening after they click "Sign in". `GET /ready` is public, cheap and touches the database.
 */
import { API_URL, DATA_SOURCE } from "./config";

export type BackendState = "idle" | "checking" | "waking" | "ready";

const SLOW_MS = 2500;
let state: BackendState = "idle";
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: BackendState) {
  if (state === next) return;
  state = next;
  listeners.forEach((l) => l());
}

export const backendState = {
  get: (): BackendState => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Fire-and-forget, once per page load. Never throws. */
export function prewarmBackend(fetchImpl: typeof fetch = fetch): Promise<void> {
  if (DATA_SOURCE !== "api" || !API_URL || typeof window === "undefined") return Promise.resolve();
  if (pending) return pending;
  set("checking");
  const slow = setTimeout(() => state === "checking" && set("waking"), SLOW_MS);
  pending = fetchImpl(`${API_URL}/ready`, { cache: "no-store", credentials: "omit", keepalive: true })
    .then(() => set("ready"))
    .catch(() => set("idle")) // the real request will surface any error
    .finally(() => clearTimeout(slow));
  return pending;
}

/** Test hook. */
export function resetWarmupForTests() {
  pending = null;
  state = "idle";
}
