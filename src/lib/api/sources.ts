/**
 * Source records arrive embedded in research responses. This cache lets
 * synchronous lookups (citations, progress view) resolve ids already seen.
 */
import type { Source } from "@/types";
import type { SourceDTO } from "./types";

const cache = new Map<string, Source>();

export function toSource(s: SourceDTO): Source {
  return {
    id: s.id,
    title: s.title,
    domain: s.domain,
    url: s.url,
    publisher: s.publisher,
    authors: s.authors.length ? s.authors : undefined,
    publishedAt: s.publishedAt ?? undefined,
    type: s.type,
    relevance: s.relevance,
    doi: s.doi ?? undefined,
    abstract: s.abstract ?? undefined,
  };
}

export function rememberSources(sources: Source[]) {
  sources.forEach((s) => cache.set(s.id, s));
}

export const apiSourceService = {
  getSync: (id: string) => cache.get(id),
  async getMany(ids: string[]): Promise<Source[]> {
    return ids.map((id) => cache.get(id)).filter((s): s is Source => Boolean(s));
  },
  all: (): Source[] => [...cache.values()],
};
