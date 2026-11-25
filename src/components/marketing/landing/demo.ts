import { DEMO_GENERAL } from "@/data/landing-demo";
import type { ClaimStatus } from "@/types";

/** Facts used across the landing page, derived from one real production run (see data/landing-demo.ts). */

const citeIndex = new Map(DEMO_GENERAL.report?.citations.map((c) => [c.sourceId, c.index]) ?? []);
const evidenceById = new Map(DEMO_GENERAL.evidence.map((e) => [e.id, e]));
const sourceById = new Map(DEMO_GENERAL.sources.map((s) => [s.id, s]));

export type Trail = {
  index: number;
  claim: string;
  status: ClaimStatus;
  passage: string;
  source: { title: string; domain: string; url: string };
};

/** One supported claim per cited source, in citation order: claim → verbatim passage → source. */
export const TRAILS: Trail[] = (() => {
  const seen = new Set<number>();
  return DEMO_GENERAL.claims
    .filter((c) => c.status === "supported" && citeIndex.has(c.sourceIds[0]) && c.evidenceIds.length)
    .map((c) => {
      const s = sourceById.get(c.sourceIds[0])!;
      return {
        index: citeIndex.get(c.sourceIds[0])!,
        claim: c.text,
        status: c.status,
        passage: evidenceById.get(c.evidenceIds[0])!.passage,
        source: { title: s.title, domain: s.domain, url: s.url },
      };
    })
    .filter((t) => (seen.has(t.index) ? false : (seen.add(t.index), true)))
    .sort((a, b) => a.index - b.index);
})();

export const QUESTION = DEMO_GENERAL.query;
export const TITLE = DEMO_GENERAL.title;
export const METRICS = DEMO_GENERAL.metrics;

/** Real progress messages from the run, keyed by stage id. */
export const STAGE = Object.fromEntries(DEMO_GENERAL.steps.map((s) => [s.id, s.detail ?? ""])) as Record<string, string>;

/* ---- Additional views of the same real runs, for the landing showcase ---- */

export type CitedSource = { index: number; id: string; title: string; domain: string; url: string };

/** The four sources the report actually cited, in citation order. */
export const CITED: CitedSource[] = (DEMO_GENERAL.report?.citations ?? []).map((c) => {
  const s = sourceById.get(c.sourceId)!;
  return { index: c.index, id: s.id, title: s.title, domain: s.domain, url: s.url };
});

/** Every candidate claim from the run with its verification label and confidence. */
export const CLAIMS = DEMO_GENERAL.claims.map((c) => ({
  id: c.id,
  text: c.text,
  status: c.status,
  confidence: c.confidence,
  cite: citeIndex.get(c.sourceIds[0]),
  passage: c.evidenceIds[0] ? evidenceById.get(c.evidenceIds[0])?.passage : undefined,
  domain: sourceById.get(c.sourceIds[0])?.domain,
}));

export const SUMMARY = DEMO_GENERAL.report?.summary[0] ?? "";
export const LIMITATIONS = DEMO_GENERAL.report?.limitations ?? [];
export const WEB_RESULTS = DEMO_GENERAL.sources.slice(0, 4).map((s) => ({ title: s.title, domain: s.domain, relevance: s.relevance }));
