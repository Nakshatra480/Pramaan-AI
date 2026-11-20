/**
 * Minimal, privacy-preserving product analytics (optional).
 * Only these events are tracked, and payloads never contain research content,
 * document names or queries.
 */
import { firebaseEnv, getFirebaseApp, isFirebaseConfigured } from "./config";

type ProductEvent = "research_started" | "research_completed" | "project_created" | "document_uploaded";
type SafeParams = { mode?: "quick" | "standard" | "deep"; in_project?: boolean; count?: number };

export async function track(event: ProductEvent, params: SafeParams = {}) {
  if (!isFirebaseConfigured || !firebaseEnv.measurementId || typeof window === "undefined") return;
  try {
    const { getAnalytics, isSupported, logEvent } = await import("firebase/analytics");
    if (!(await isSupported())) return;
    logEvent(getAnalytics(getFirebaseApp()), event, params);
  } catch {
    /* analytics must never break the product */
  }
}
