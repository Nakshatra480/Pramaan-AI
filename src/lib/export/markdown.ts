import { hostOf, plain, sentence, type ExportBlock, type ExportDocument, type Inline } from "./document";

/** Escapes characters that would otherwise turn report prose into Markdown syntax. */
function esc(text: string): string {
  return text.replace(/([\\`*_<>])/g, "\\$1").replace(/^(\s*)([#>+-]|\d+\.)(\s)/, "$1\\$2$3");
}

function md(runs: Inline[], d: ExportDocument): string {
  return esc(plain(runs, d.style));
}

/** A table cell: no pipes or line breaks (they would end the cell). */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function block(b: ExportBlock, d: ExportDocument): string[] {
  switch (b.kind) {
    case "paragraph":
      return [md(b.runs, d), ""];
    case "list":
      return [...b.items.map((i) => `- ${md(i, d)}`), ""];
    case "table":
      return [
        `**${b.label}.** ${md(b.caption, d)}`,
        "",
        `| ${b.columns.map((c) => cell(esc(c))).join(" | ")} |`,
        `| ${b.columns.map(() => "---").join(" | ")} |`,
        ...b.rows.map((r) => `| ${r.map((c) => cell(md(c, d))).join(" | ")} |`),
        "",
      ];
    case "diagram":
      // GitHub, GitLab, Obsidian and most Markdown editors draw Mermaid blocks.
      return ["```mermaid", b.code, "```", "", `*${b.label}. ${md(b.caption, d)}*`, ""];
    case "figure": {
      const source = b.sourceUrl ? `[${esc(b.credit || hostOf(b.sourceUrl))}](<${b.sourceUrl}>)` : esc(b.credit);
      const cite = b.sourceNumber && d.style === "numeric" ? ` [${b.sourceNumber}]` : "";
      return [`![${esc(b.caption).replace(/[[\]]/g, "")}](<${b.url}>)`, "", `*${b.label}. ${esc(sentence(b.caption))} Source: ${source}${cite}*`, ""];
    }
  }
}

/** A clean, portable Markdown report: a paper (abstract, numbered sections, tables, Mermaid diagrams, figures) or
 *  an older report (summary, findings, analysis), with a linked source list. */
export function toMarkdown(d: ExportDocument): string {
  const out: string[] = [`# ${esc(d.title)}`, ""];
  if (d.question && d.question !== d.title) out.push(`> **Research question:** ${esc(d.question)}`, "");
  if (d.keywords.length) out.push(`**Keywords:** ${d.keywords.map(esc).join(", ")}`, "");
  out.push(`*${[d.mode, d.date, `${d.sources.length} sources cited`].filter(Boolean).join(" · ")}*`, "", "---", "");

  if (d.paper) {
    if (d.summary.length) out.push("## Abstract", "", ...d.summary.flatMap((p) => [md(p, d), ""]));
    for (const s of d.sections) out.push(`## ${s.number}. ${esc(s.heading)}`, "", ...s.blocks.flatMap((b) => block(b, d)));
  } else if (d.summary.length) out.push("## Executive summary", "", ...d.summary.flatMap((p) => [md(p, d), ""]));
  if (d.findings.length) {
    out.push("## Key findings", "");
    d.findings.forEach((f, i) => out.push(`### ${i + 1}. ${esc(f.title)}`, "", md(f.body, d), ""));
  }
  if (d.analysis.length) {
    out.push("## Analysis", "");
    d.analysis.forEach((a) => out.push(`### ${esc(a.heading)}`, "", ...a.paragraphs.flatMap((p) => [md(p, d), ""])));
  }
  if (!d.paper && d.limitations.length) out.push("## Limitations", "", ...d.limitations.map((l) => `- ${md(l, d)}`), "");
  if (d.sources.length) {
    out.push(d.paper || d.style !== "numeric" ? "## References" : "## Sources", "");
    for (const s of d.sources) {
      const ref = d.style === "numeric" ? s.reference.replace(/^\[\d+\]\s*/, "") : s.reference;
      // The URL becomes an autolink and is never escaped (escaping would break it).
      const at = s.url ? ref.indexOf(s.url) : -1;
      const line = at < 0 ? esc(ref) : `${esc(ref.slice(0, at))}<${s.url}>${esc(ref.slice(at + s.url.length))}`;
      out.push(d.style === "numeric" ? `${s.number}. ${line}` : `- ${line}`);
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
