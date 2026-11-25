/** Account data shared by both adapters: usage figures (Billing) and the data export (Privacy). */
import { db } from "./db";
import { preferencesService } from "./preferences";

export interface AccountUsage {
  periodStart: string;
  researchRunsThisMonth: number;
  deepRunsThisMonth: number;
  researchTotal: number;
  documents: number;
  storageBytes: number;
  projects: number;
  plan: string;
  /** Plan limits are not enforced during early access. */
  limitsEnforced: boolean;
}

export interface AccountExport {
  blob: Blob;
  filename: string;
}

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Demo-mode usage, computed from the in-browser store (same shape as GET /me/usage). */
export function mockUsage(plan: string): AccountUsage {
  const { research, documents, projects } = db.read();
  const start = monthStart();
  const thisMonth = research.filter((r) => new Date(r.createdAt) >= start);
  return {
    periodStart: start.toISOString(),
    researchRunsThisMonth: thisMonth.length,
    deepRunsThisMonth: thisMonth.filter((r) => r.mode === "deep").length,
    researchTotal: research.length,
    documents: documents.length,
    storageBytes: documents.reduce((n, d) => n + (d.sizeBytes || 0), 0),
    projects: projects.length,
    plan,
    limitsEnforced: false,
  };
}

/** Demo-mode export: the in-browser store as JSON (same top-level shape as GET /me/export). */
export function mockExport(profile: Record<string, unknown>): AccountExport {
  const { research, documents, projects } = db.read();
  const exportedAt = new Date().toISOString();
  const data = { exportedAt, format: "pramaan-export/1", profile: { ...profile, preferences: preferencesService.read() }, projects, documents, research };
  return { blob: new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename: `pramaan-export-${exportedAt.slice(0, 10)}.json` };
}

/** Next calendar month's first day — when monthly usage counts restart. */
export function nextReset(periodStart: string) {
  const d = new Date(periodStart);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
