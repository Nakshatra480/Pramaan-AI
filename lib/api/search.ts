/**
 * Global search in API mode: GET /search searches all of the user's research, projects and
 * documents on the server (not just what this tab happens to have loaded). Settings pages
 * are matched locally.
 */
import type { SearchResult } from "@/lib/mock/search";
import { matchSettings } from "@/lib/mock/search";
import { apiFetch } from "./client";

interface SearchHitDTO {
  id: string;
  kind: "research" | "project" | "document";
  title: string;
  subtitle: string | null;
  href: string;
}

const STATUS: Record<string, string> = { completed: "Completed research", failed: "Research failed", cancelled: "Cancelled research" };

export async function apiSearchAll(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const hits = await apiFetch<SearchHitDTO[]>(`/search?q=${encodeURIComponent(q.slice(0, 200))}&limit=6`, { signal });
  return [
    ...hits.map((h) => ({
      id: h.id,
      kind: h.kind,
      title: h.title,
      subtitle: h.kind === "research" ? (STATUS[h.subtitle ?? ""] ?? "Research in progress") : (h.subtitle ?? undefined),
      href: h.href,
    })),
    ...matchSettings(q),
  ];
}
