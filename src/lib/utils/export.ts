import type { Research, Source } from "@/types";

/** Builds a Markdown export of a research report (PRD §42). */
export function researchToMarkdown(r: Research, sources: Source[]): string {
  const rep = r.report;
  if (!rep) return `# ${r.title}\n`;
  const lines: string[] = [
    `# ${r.title}`,
    "",
    `> ${r.query}`,
    "",
    `${r.metrics.sources} sources · ${r.metrics.evidence} evidence passages · ${r.metrics.verifiedClaims} verified claims`,
    "",
    "## Executive summary",
    "",
    ...rep.summary.flatMap((p) => [p, ""]),
    "## Key findings",
    "",
    ...rep.findings.map((f, i) => `${i + 1}. **${f.title}** — ${f.body}`),
    "",
    "## Detailed analysis",
    "",
    ...rep.analysis.flatMap((s) => [`### ${s.heading}`, "", ...s.paragraphs.flatMap((p) => [p, ""])]),
    "## Limitations",
    "",
    ...rep.limitations.map((l) => `- ${l}`),
    "",
    "## Sources",
    "",
    ...rep.citations.map((c) => {
      const s = sources.find((x) => x.id === c.sourceId);
      return s ? `[${c.index}] ${s.title}. ${s.publisher}, ${s.publishedAt?.slice(0, 4) ?? "n.d."}. ${s.url}` : `[${c.index}]`;
    }),
    "",
  ];
  return lines.join("\n");
}

export function researchToPlainText(r: Research): string {
  const rep = r.report;
  if (!rep) return r.title;
  return [r.title, "", ...rep.summary, "", ...rep.findings.map((f, i) => `${i + 1}. ${f.title}: ${f.body}`)].join("\n");
}

export function downloadFile(filename: string, content: string, type = "text/markdown") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}
