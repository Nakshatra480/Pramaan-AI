import type { CitationStyle, Source } from "@/types";

/** Splits rich text into plain segments and citation markers like `[3]`. */
export type RichSegment = { type: "text"; value: string } | { type: "cite"; index: number };

const CITE = /\[(\d{1,3})\]/g;

export function parseRichText(text: string): RichSegment[] {
  const out: RichSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", value: text.slice(last, at) });
    out.push({ type: "cite", index: Number(m[1]) });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

export function citedIndices(texts: string[]): number[] {
  const set = new Set<number>();
  texts.forEach((t) => parseRichText(t).forEach((s) => s.type === "cite" && set.add(s.index)));
  return [...set].sort((a, b) => a - b);
}

export function stripCitations(text: string) {
  return text.replace(/\s?\[\d{1,3}\]/g, "");
}

/* ------------------------------------------------------------ citation styles */

function surname(name: string) {
  const n = name.trim();
  if (n.includes(",")) return n.split(",")[0]!.trim();
  const parts = n.split(/\s+/);
  return parts[parts.length - 1] ?? n;
}

function year(source: Pick<Source, "publishedAt">) {
  const y = source.publishedAt ? new Date(source.publishedAt).getUTCFullYear() : NaN;
  return Number.isFinite(y) ? String(y) : "n.d.";
}

/** The author part of an in-text citation; falls back to the publisher, then a shortened title. */
function who(source: Pick<Source, "authors" | "publisher" | "title">, style: Exclude<CitationStyle, "numeric">) {
  const names = (source.authors ?? []).filter(Boolean).map(surname);
  if (!names.length) return source.publisher?.trim() || `“${source.title.split(/\s+/).slice(0, 4).join(" ")}”`;
  if (names.length === 1) return names[0]!;
  if (style === "apa") return names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} et al.`;
  if (style === "mla") return names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} et al.`;
  // Chicago author-date: up to three names, then "et al."
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")}${names.length === 3 ? "," : ""} and ${names[names.length - 1]}`;
  return `${names[0]} et al.`;
}

/**
 * In-text citation for a source in the user's chosen style (Settings → Research → Citation style).
 * Numeric returns the index; author–date styles use the source's authors and publication year.
 */
export function citationLabel(source: Pick<Source, "authors" | "publisher" | "title" | "publishedAt">, style: CitationStyle, index: number): string {
  if (style === "numeric") return String(index);
  if (style === "apa") return `${who(source, style)}, ${year(source)}`;
  if (style === "mla") return who(source, style);
  return `${who(source, style)} ${year(source)}`;
}
