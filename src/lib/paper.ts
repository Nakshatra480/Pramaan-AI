/**
 * Reading order of a paper-format report, shared by the page, narration and exports so section numbers and
 * "Table n" / "Figure n" labels always agree.
 */
import type { PaperSection, ReportBlock, ResearchReport } from "@/types";

/** A paper section as rendered: the model's sections plus Limitations (placed before the Conclusion). */
export interface PaperPart {
  id: string;
  number: number;
  heading: string;
  blocks: ReportBlock[];
  limitations?: string[];
}

const CLOSING = /^(?:conclusions?|concluding remarks|summary and conclusions?)$/i;

/** Numbered sections in reading order — shared with narration and exports so all three agree. */
export function paperParts(report: ResearchReport): PaperPart[] {
  const sections: PaperSection[] = report.sections ?? [];
  const parts: Omit<PaperPart, "number">[] = sections.map((s, i) => ({
    id: `section-${i + 1}`,
    heading: s.heading,
    blocks: s.blocks,
  }));
  if (report.limitations.length) {
    const lim = {
      id: "limitations",
      heading: "Limitations",
      blocks: [],
      limitations: report.limitations,
    };
    const last = parts[parts.length - 1];
    if (last && CLOSING.test(last.heading)) parts.splice(parts.length - 1, 0, lim);
    else parts.push(lim);
  }
  return parts.map((p, i) => ({ ...p, number: i + 1 }));
}

/** "Table n" / "Figure n" labels in reading order (diagrams and images share the figure sequence). */
export function visualNumbers(parts: PaperPart[]): Map<ReportBlock, string> {
  const labels = new Map<ReportBlock, string>();
  let tables = 0;
  let figures = 0;
  for (const p of parts)
    for (const b of p.blocks) {
      if (b.type === "table") labels.set(b, `Table ${++tables}`);
      else if (b.type === "diagram" || b.type === "figure") labels.set(b, `Figure ${++figures}`);
    }
  return labels;
}
