import { SOURCES } from "@/data/sources";
import { db } from "./db";

export type SearchResultKind = "research" | "project" | "document" | "source" | "setting" | "action";

export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle?: string;
  href: string;
}

const SETTINGS: SearchResult[] = [
  ["profile", "Profile"],
  ["research", "Research defaults"],
  ["ai", "AI & models"],
  ["appearance", "Appearance"],
  ["notifications", "Notifications"],
  ["privacy", "Privacy & data"],
  ["billing", "Plan & billing"],
].map(([id, title]) => ({ id: `set-${id}`, kind: "setting", title, subtitle: "Settings", href: `/settings/${id}` }));

function score(text: string, q: string) {
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 3;
  if (t.includes(` ${q}`)) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

/** Settings pages matching a query (both adapters). */
export function matchSettings(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SETTINGS.filter((s) => score(s.title, q) > 0);
}

/** Global search over the demo store. Async to share the API adapter's signature. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchAll(query: string, _signal?: AbortSignal): Promise<SearchResult[]> {
  return searchAllSync(query);
}

function searchAllSync(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  const { research, projects, documents } = db.read();
  const all: SearchResult[] = [
    ...research.map((r) => ({ id: r.id, kind: "research" as const, title: r.title, subtitle: `${r.metrics.sources} sources · ${r.metrics.verifiedClaims} verified claims`, href: `/research/${r.id}` })),
    ...projects.map((p) => ({ id: p.id, kind: "project" as const, title: p.name, subtitle: p.description, href: `/projects/${p.id}` })),
    ...documents.map((d) => ({ id: d.id, kind: "document" as const, title: d.title, subtitle: d.filename, href: `/library/${d.id}` })),
    ...SOURCES.filter((s) => s.type !== "library").map((s) => ({ id: s.id, kind: "source" as const, title: s.title, subtitle: `${s.publisher} · ${s.domain}`, href: sourceHref(s.id) })),
    ...SETTINGS,
  ];
  if (!q) return [];
  return all
    .map((r) => ({ r, s: score(r.title, q) * 2 + score(r.subtitle ?? "", q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
}

/** Opens the first research that cites a source, with the source drawer focused. */
function sourceHref(sourceId: string) {
  const r = db.read().research.find((x) => x.sourceIds.includes(sourceId) && x.report);
  return r ? `/research/${r.id}?source=${sourceId}` : "/history";
}
