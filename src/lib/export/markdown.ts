import { plain, type ExportDocument, type Inline } from "./document";

/** Escapes characters that would otherwise turn report prose into Markdown syntax. */
function esc(text: string): string {
  return text.replace(/([\\`*_<>])/g, "\\$1").replace(/^(\s*)([#>+-]|\d+\.)(\s)/, "$1\\$2$3");
}

function md(runs: Inline[], d: ExportDocument): string {
  return esc(plain(runs, d.style));
}

/** A clean, portable Markdown report: headings, numbered findings and a linked source list. */
export function toMarkdown(d: ExportDocument): string {
  const out: string[] = [`# ${esc(d.title)}`, ""];
  if (d.question && d.question !== d.title) out.push(`> **Research question:** ${esc(d.question)}`, "");
  out.push(`*${[d.mode, d.date, `${d.sources.length} sources cited`].filter(Boolean).join(" · ")}*`, "", "---", "");

  if (d.summary.length) out.push("## Executive summary", "", ...d.summary.flatMap((p) => [md(p, d), ""]));
  if (d.findings.length) {
    out.push("## Key findings", "");
    d.findings.forEach((f, i) => out.push(`### ${i + 1}. ${esc(f.title)}`, "", md(f.body, d), ""));
  }
  if (d.analysis.length) {
    out.push("## Analysis", "");
    d.analysis.forEach((a) => out.push(`### ${esc(a.heading)}`, "", ...a.paragraphs.flatMap((p) => [md(p, d), ""])));
  }
  if (d.limitations.length) out.push("## Limitations", "", ...d.limitations.map((l) => `- ${md(l, d)}`), "");
  if (d.sources.length) {
    out.push(d.style === "numeric" ? "## Sources" : "## References", "");
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
