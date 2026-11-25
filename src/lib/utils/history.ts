import type { Research, ResearchMode } from "@/types";

export type HistoryFilter = "all" | "project" | "independent" | "attention";
export type HistorySort = "newest" | "oldest" | "verified";

export function filterHistory(
  items: Research[],
  opts: { query?: string; filter?: HistoryFilter; projectId?: string; mode?: ResearchMode; sort?: HistorySort },
): Research[] {
  const q = opts.query?.trim().toLowerCase() ?? "";
  const out = items.filter((r) => {
    if (q && !`${r.title} ${r.query} ${r.topic ?? ""}`.toLowerCase().includes(q)) return false;
    if (opts.projectId && r.projectId !== opts.projectId) return false;
    if (opts.mode && r.mode !== opts.mode) return false;
    switch (opts.filter ?? "all") {
      case "project":
        return r.projectId !== null;
      case "independent":
        return r.projectId === null;
      case "attention":
        return r.status === "failed" || r.status === "timeout" || r.status === "no_sources";
      default:
        return true;
    }
  });
  const sort = opts.sort ?? "newest";
  return out.sort((a, b) =>
    sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : sort === "verified" ? b.metrics.verifiedClaims - a.metrics.verifiedClaims : b.createdAt.localeCompare(a.createdAt),
  );
}

export function groupByDate(items: Research[], now = Date.now()): { label: string; items: Research[] }[] {
  const day = 86_400_000;
  const buckets: Record<string, Research[]> = {};
  const order: string[] = [];
  for (const r of items) {
    const age = now - new Date(r.createdAt).getTime();
    const label = age < day ? "Today" : age < 2 * day ? "Yesterday" : age < 7 * day ? "This week" : age < 30 * day ? "This month" : "Earlier";
    if (!buckets[label]) {
      buckets[label] = [];
      order.push(label);
    }
    buckets[label].push(r);
  }
  return order.map((label) => ({ label, items: buckets[label] }));
}
