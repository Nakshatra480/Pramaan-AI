/**
 * Turns a research report into a narration script: plain spoken text, in reading order, split into
 * short chunks. Short chunks keep browser speech engines reliable (Chrome cuts off long utterances),
 * let playback pause and resume at a sentence, and let the page show which section is being read.
 */
import { paperParts, visualNumbers } from "@/lib/paper";
import { isPaper, type ClaimStatus, type Research } from "@/types";

export interface NarrationChunk {
  /** Report section being read; matches the section's element id ("summary", "findings", …). */
  sectionId: string;
  sectionLabel: string;
  text: string;
}

export const MAX_CHUNK = 220;

const STATUS_WORDS: Record<ClaimStatus, string> = {
  supported: "supported",
  partially_supported: "partially supported",
  unsupported: "not supported",
  insufficient_evidence: "insufficient evidence",
};

/** Removes everything that shouldn't be read aloud: citation markers, markdown, URLs, stray symbols. */
export function speakable(text: string): string {
  return text
    .replace(/\s?\[(?:\d{1,3}|[CE]\d+)(?:\s*[,;–-]\s*(?:\d{1,3}|[CE]\d+))*\]/g, "") // [3], [1, 4], [C2]
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, "$1") // [label](url)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits text into sentence-aligned pieces of at most `max` characters (long sentences break at commas, then words). */
export function chunkText(text: string, max = MAX_CHUNK): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["”’)]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const out: string[] = [];
  let cur = "";
  const push = (piece: string) => {
    if (!cur) cur = piece;
    else if (cur.length + 1 + piece.length <= max) cur += " " + piece;
    else {
      out.push(cur);
      cur = piece;
    }
  };
  for (const s of sentences) {
    if (s.length <= max) {
      push(s);
      continue;
    }
    for (const part of s.split(/(?<=[,;:])\s+/)) {
      if (part.length <= max) push(part);
      else for (const w of part.split(/\s+/)) push(w);
    }
  }
  if (cur) out.push(cur);
  return out;
}

function ensureStop(s: string) {
  return /[.!?…]["”’)]*$/.test(s) ? s : `${s}.`;
}

/**
 * The whole report as narration chunks. A paper: title, question, abstract and each numbered section (tables
 * and figures are announced by their captions). A legacy report: title, summary, findings, analysis, evidence
 * and limitations.
 */
export function buildNarration(research: Research): NarrationChunk[] {
  const report = research.report;
  if (!report) return [];
  const out: NarrationChunk[] = [];
  const add = (sectionId: string, sectionLabel: string, text: string) => {
    const clean = speakable(text);
    if (!clean) return;
    for (const piece of chunkText(ensureStop(clean))) out.push({ sectionId, sectionLabel, text: piece });
  };

  if (isPaper(report)) {
    add("top", "Title", report.title || research.title);
    add("top", "Title", `The research question was: ${research.query}`);
    if (report.summary.length) {
      add("abstract", "Abstract", "Abstract.");
      report.summary.forEach((p) => add("abstract", "Abstract", p));
    }
    const parts = paperParts(report);
    const labels = visualNumbers(parts);
    for (const part of parts) {
      const label = `${part.number}. ${part.heading}`;
      add(part.id, label, `Section ${part.number}: ${part.heading}.`);
      part.limitations?.forEach((l) => add(part.id, label, l));
      for (const b of part.blocks) {
        if (b.type === "paragraph") add(part.id, label, b.text);
        else if (b.type === "list") b.items.forEach((item) => add(part.id, label, item));
        else add(part.id, label, `${labels.get(b)}: ${b.caption}`); // tables, diagrams and figures by caption
      }
    }
    add("end", "End", "End of report.");
    return out;
  }

  add("top", "Introduction", research.title);
  add("top", "Introduction", `The question was: ${research.query}`);

  if (report.summary.length) {
    add("summary", "Executive Summary", "Executive summary.");
    report.summary.forEach((p) => add("summary", "Executive Summary", p));
  }

  if (report.findings.length) {
    add("findings", "Key Findings", `Key findings. There ${report.findings.length === 1 ? "is one finding" : `are ${report.findings.length} findings`}.`);
    report.findings.forEach((f, i) => {
      add("findings", "Key Findings", `Finding ${i + 1}: ${ensureStop(speakable(f.title))}`);
      add("findings", "Key Findings", f.body);
    });
  }

  if (report.analysis.length) {
    add("analysis", "Detailed Analysis", "Detailed analysis.");
    report.analysis.forEach((s) => {
      add("analysis", "Detailed Analysis", s.heading);
      s.paragraphs.forEach((p) => add("analysis", "Detailed Analysis", p));
    });
  }

  if (research.claims.length) {
    const n = research.claims.length;
    add("evidence", "Evidence", `Evidence. Pramaan checked ${n === 1 ? "one claim" : `${n} claims`} against the collected sources.`);
    research.claims.forEach((c, i) => add("evidence", "Evidence", `Claim ${i + 1}, ${STATUS_WORDS[c.status]}: ${c.text}`));
  }

  if (report.limitations.length) {
    add("limitations", "Limitations", "Limitations.");
    report.limitations.forEach((l) => add("limitations", "Limitations", l));
  }

  add("end", "End", "End of report.");
  return out;
}

/** Index of the first chunk of the section after (or before) the one containing `index`. */
export function sectionStart(chunks: NarrationChunk[], index: number, direction: 1 | -1): number {
  const current = chunks[index]?.sectionId;
  if (direction === 1) {
    const next = chunks.findIndex((c, i) => i > index && c.sectionId !== current);
    return next === -1 ? chunks.length : next;
  }
  // Back: to the start of this section, or — if already near its start — the previous section.
  let start = index;
  while (start > 0 && chunks[start - 1].sectionId === current) start--;
  if (index - start > 1) return start;
  if (start === 0) return 0;
  const prev = chunks[start - 1].sectionId;
  let p = start - 1;
  while (p > 0 && chunks[p - 1].sectionId === prev) p--;
  return p;
}

/** Rough listening time at a given rate (≈ 160 spoken words per minute at 1×). */
export function estimateMinutes(chunks: NarrationChunk[], rate = 1): number {
  const words = chunks.reduce((n, c) => n + c.text.split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / (160 * rate)));
}
