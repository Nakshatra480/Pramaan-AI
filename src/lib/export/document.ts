/**
 * The exported report, independent of format. Only the research itself goes in: for a paper, its title,
 * question, keywords, abstract, numbered sections (with their tables, diagrams and figures) and references;
 * for an older report, the summary, findings, analysis and limitations. Nothing from the app's interface
 * (actions, follow-ups, progress, verification badges, the claim appendix) is exported.
 */
import { paperParts, visualNumbers } from "@/lib/paper";
import { citationLabel, parseRichText } from "@/lib/utils/citations";
import { isPaper, type CitationStyle, type Research, type Source, type SourceType } from "@/types";

/** A run of report text: plain text, or one in-text citation covering one or more sources. */
export type Inline = { kind: "text"; text: string } | { kind: "cite"; numbers: number[]; label: string };

export interface ExportSource {
  number: number;
  title: string;
  publisher: string;
  authors: string[];
  year: string;
  url: string;
  type: string;
  /** The full reference in the chosen citation style. */
  reference: string;
}

export type ExportBlock =
  | { kind: "paragraph"; runs: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "table"; label: string; caption: Inline[]; columns: string[]; rows: Inline[][][] }
  /** `svg` is filled in by `withDiagrams` (PDF) — diagrams are rendered in the browser at export time. */
  | { kind: "diagram"; label: string; caption: Inline[]; code: string; svg?: string }
  | { kind: "figure"; label: string; caption: string; url: string; credit: string; sourceUrl: string; sourceNumber: number | null };

export interface ExportSection {
  number: number;
  heading: string;
  blocks: ExportBlock[];
}

export interface ExportDocument {
  title: string;
  question: string;
  date: string;
  mode: string;
  style: CitationStyle;
  /** A research paper (abstract + numbered sections) rather than an older summary/findings report. */
  paper: boolean;
  keywords: string[];
  /** The abstract, in a paper. */
  summary: Inline[][];
  /** Paper only: numbered sections in reading order, Limitations included. */
  sections: ExportSection[];
  findings: { title: string; body: Inline[] }[];
  analysis: { heading: string; paragraphs: Inline[][] }[];
  limitations: Inline[][];
  sources: ExportSource[];
}

const MODE: Record<Research["mode"], string> = { quick: "Quick research", standard: "Standard research", deep: "Deep research" };
const TYPE: Record<SourceType, string> = {
  academic: "Scholarly",
  web: "Web",
  news: "News",
  documentation: "Documentation",
  report: "Report",
  library: "Your library",
  encyclopedia: "Wikipedia",
};

function yearOf(s: Source): string {
  const y = s.publishedAt ? new Date(s.publishedAt).getUTCFullYear() : NaN;
  return Number.isFinite(y) ? String(y) : "n.d.";
}

function reference(s: Source, style: CitationStyle, n: number): string {
  const authors = (s.authors ?? []).filter(Boolean);
  const who = authors.length ? (authors.length > 3 ? `${authors.slice(0, 3).join(", ")}, et al.` : authors.join(", ")) : s.publisher;
  const year = yearOf(s);
  const url = s.url.startsWith("http") ? s.url : "";
  const title = s.title.replace(/\.$/, "");
  const venue = s.publisher && s.publisher !== who ? s.publisher : "";
  switch (style) {
    case "apa":
      return [`${who} (${year}).`, `${title}.`, venue && `${venue}.`, url].filter(Boolean).join(" ");
    case "mla":
    {
      const tail = [venue, year === "n.d." ? "" : year, url].filter(Boolean).join(", ");
      return `${who}. “${title}.”${tail ? ` ${tail}.` : ""}`;
    }
    case "chicago":
      return [`${who}.`, `${year}.`, `“${title}.”`, venue && `${venue}.`, url].filter(Boolean).join(" ");
    default:
      return [`[${n}]`, `${title}.`, [venue || s.domain, year].filter(Boolean).join(", ") + ".", url].filter(Boolean).join(" ");
  }
}

/** "1, 2, 3, 4, 9, 10" → "1–4, 9, 10": runs of three or more consecutive numbers become a range. */
export function numberRanges(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${sorted[i]}–${sorted[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(sorted[k]));
    i = j + 1;
  }
  return parts.join(", ");
}

/** The research question, unless it only repeats the title (which is the question, tidied). */
function distinctQuestion(question: string, title: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(question) === norm(title) ? "" : question;
}

/** Splits text into runs, merging adjacent markers ("[1] [2][3]") into one citation. */
export function inlines(text: string, style: CitationStyle, byNumber: Map<number, Source>): Inline[] {
  const out: Inline[] = [];
  for (const seg of parseRichText(text)) {
    if (seg.type === "text") {
      const prev = out[out.length - 1];
      if (prev?.kind === "cite" && !seg.value.trim()) continue; // whitespace between two markers
      out.push({ kind: "text", text: seg.value });
      continue;
    }
    if (!byNumber.has(seg.index)) {
      // A marker without a source is dropped, never shown raw — along with the space before it.
      const prev = out[out.length - 1];
      if (prev?.kind === "text") prev.text = prev.text.replace(/\s+$/, "");
      continue;
    }
    // Trailing whitespace before a citation hugs it to the word: "storage [1]" → "storage¹".
    const prev = out[out.length - 1];
    if (prev?.kind === "text") prev.text = prev.text.replace(/\s+$/, "");
    if (prev?.kind === "cite") {
      if (!prev.numbers.includes(seg.index)) prev.numbers.push(seg.index);
    } else out.push({ kind: "cite", numbers: [seg.index], label: "" });
  }
  // Text that followed a merged citation run is kept; labels are computed once the runs are final.
  // Neighbouring text runs (left when a marker was dropped) become one.
  const merged: Inline[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (r.kind === "text" && last?.kind === "text") last.text += r.text;
    else merged.push(r);
  }
  return merged
    .filter((r) => r.kind === "cite" || r.text.length > 0)
    .map((r) => {
      if (r.kind !== "cite") return r;
      if (style === "numeric") return { ...r, label: numberRanges(r.numbers) };
      return { ...r, label: r.numbers.map((n) => citationLabel(byNumber.get(n)!, style, n)).join("; ") };
    });
}

export function buildExportDocument(r: Research, sources: Source[], style: CitationStyle = "numeric"): ExportDocument {
  const rep = r.report;
  const byId = new Map(sources.map((s) => [s.id, s]));
  const byNumber = new Map<number, Source>();
  for (const c of rep?.citations ?? []) {
    const s = byId.get(c.sourceId);
    if (s) byNumber.set(c.index, s);
  }
  const run = (t: string) => inlines(t, style, byNumber);
  const when = r.completedAt ?? r.createdAt;
  const exported: ExportSource[] = [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([n, s]) => ({
      number: n,
      title: s.title,
      publisher: s.publisher || s.domain,
      authors: s.authors ?? [],
      year: yearOf(s),
      url: s.url.startsWith("http") ? s.url : "",
      type: TYPE[s.type] ?? "Source",
      reference: reference(s, style, n),
    }));
  if (style !== "numeric") exported.sort((a, b) => a.reference.localeCompare(b.reference));
  const paper = isPaper(rep);
  const title = (paper && rep.title) || r.title;
  return {
    title,
    question: distinctQuestion(r.query.trim(), title),
    paper,
    keywords: paper ? (rep.keywords ?? []) : [],
    sections: paper ? exportSections(rep, run) : [],
    date: when ? new Date(when).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "",
    mode: MODE[r.mode],
    style,
    summary: (rep?.summary ?? []).map(run),
    findings: (rep?.findings ?? []).map((f) => ({ title: f.title, body: run(f.body) })),
    analysis: (rep?.analysis ?? []).map((a) => ({ heading: a.heading, paragraphs: a.paragraphs.map(run) })),
    limitations: (rep?.limitations ?? []).map(run),
    sources: exported,
  };
}

function exportSections(report: NonNullable<Research["report"]>, run: (t: string) => Inline[]): ExportSection[] {
  const parts = paperParts(report);
  const labels = visualNumbers(parts);
  return parts.map((p) => ({
    number: p.number,
    heading: p.heading,
    blocks: p.limitations
      ? [{ kind: "list" as const, items: p.limitations.map(run) }]
      : p.blocks.map((b): ExportBlock => {
          const label = labels.get(b) ?? "";
          switch (b.type) {
            case "paragraph":
              return { kind: "paragraph", runs: run(b.text) };
            case "list":
              return { kind: "list", items: b.items.map(run) };
            case "table":
              return { kind: "table", label, caption: run(b.caption), columns: b.columns, rows: b.rows.map((row) => row.map(run)) };
            case "diagram":
              return { kind: "diagram", label, caption: run(b.caption), code: b.code };
            case "figure":
              return { kind: "figure", label, caption: b.caption, url: b.url, credit: b.credit, sourceUrl: b.sourceUrl, sourceNumber: b.sourceIndex };
          }
        }),
  }));
}

/** Plain text of a run list, citations in their label form ("[1, 2]" or "(Smith, 2024)"). */
export function plain(runs: Inline[], style: CitationStyle): string {
  return runs
    .map((r) => (r.kind === "text" ? r.text : style === "numeric" ? ` [${r.label}]` : ` (${r.label})`))
    .join("")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

/** The answer as plain text for the clipboard: the abstract (or summary and findings of an older report). */
export function answerText(d: ExportDocument): string {
  const body = d.paper ? [] : ["", ...d.findings.map((f, i) => `${i + 1}. ${f.title}: ${plain(f.body, d.style)}`)];
  return [d.title, "", ...d.summary.map((p) => plain(p, d.style)), ...body].join("\n").trim();
}

/** A sentence that ends with exactly one full stop (captions may or may not end with one already). */
export function sentence(text: string): string {
  const t = text.trim();
  return !t || /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** A URL's host for display ("example.com"), or the URL itself if it doesn't parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "research";
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
