/**
 * PDF export: a standalone, print-styled document holding only the report, printed from a hidden frame so the
 * browser's "Save as PDF" captures the report alone — never the app around it.
 */
import { renderDiagram } from "@/lib/diagrams";
import { hostOf, sentence, type ExportBlock, type ExportDocument, type Inline } from "./document";

const h = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runs(list: Inline[], d: ExportDocument): string {
  return list
    .map((r) => {
      if (r.kind === "text") return h(r.text);
      if (d.style === "numeric") {
        const target = d.sources.find((s) => s.number === r.numbers[0]);
        return `<sup class="cite"><a href="#src-${target?.number ?? r.numbers[0]}">${h(r.label)}</a></sup>`;
      }
      return ` <span class="cite-ad">(${h(r.label)})</span>`;
    })
    .join("");
}

function block(b: ExportBlock, d: ExportDocument): string {
  switch (b.kind) {
    case "paragraph":
      return `<p>${runs(b.runs, d)}</p>`;
    case "list":
      return `<ul class="bullets">${b.items.map((i) => `<li>${runs(i, d)}</li>`).join("")}</ul>`;
    case "table":
      return `<figure class="tbl"><figcaption><b>${h(b.label)}.</b> ${runs(b.caption, d)}</figcaption><table class="data"><thead><tr>${b.columns
        .map((c) => `<th>${h(c)}</th>`)
        .join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${runs(c, d)}</td>`).join("")}</tr>`).join("")}</tbody></table></figure>`;
    case "diagram":
      // Drawn by `withDiagrams` before printing; a diagram that couldn't be drawn is left out.
      return b.svg ? `<figure class="fig"><div class="diagram">${b.svg}</div><figcaption><b>${h(b.label)}.</b> ${runs(b.caption, d)}</figcaption></figure>` : "";
    case "figure": {
      const credit = h(b.credit || hostOf(b.sourceUrl));
      const source = b.sourceUrl ? `<a href="${h(b.sourceUrl)}">${credit}</a>` : credit;
      const cite = b.sourceNumber && d.style === "numeric" ? `<sup class="cite"><a href="#src-${b.sourceNumber}">${b.sourceNumber}</a></sup>` : "";
      return `<figure class="fig"><img src="${h(b.url)}" alt="${h(b.caption)}" referrerpolicy="no-referrer"><figcaption><b>${h(b.label)}.</b> ${h(sentence(b.caption))} Source: ${source}${cite}</figcaption></figure>`;
    }
  }
}

/** Renders the paper's diagrams to SVG (in the browser) so the print document can show them. */
export async function withDiagrams(d: ExportDocument): Promise<ExportDocument> {
  const sections = await Promise.all(
    d.sections.map(async (s) => ({
      ...s,
      blocks: await Promise.all(s.blocks.map(async (b) => (b.kind === "diagram" ? { ...b, svg: await renderDiagram(b.code).catch(() => undefined) } : b))),
    })),
  );
  return { ...d, sections };
}

/** The fonts the app already loaded (Inter, Instrument Serif), so the PDF matches the brand without a download. */
function brandFonts(): string {
  const rules: string[] = [];
  if (typeof document === "undefined") return "";
  for (const sheet of Array.from(document.styleSheets)) {
    let css: CSSRuleList;
    try {
      css = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    for (const rule of Array.from(css)) {
      if (rule instanceof CSSFontFaceRule && /Inter|Instrument Serif/i.test(rule.style.getPropertyValue("font-family"))) {
        // Make relative font URLs absolute: the print frame has no base of its own.
        rules.push(rule.cssText.replace(/url\((['"]?)(?!data:|https?:)([^'")]+)\1\)/g, (_m, _q, u: string) => `url("${new URL(u, sheet.href ?? location.href).href}")`));
      }
    }
  }
  return rules.join("\n");
}

const STYLES = `
@page { size: A4; margin: 22mm 20mm 24mm;
  @bottom-left { content: "Pramaan AI · Research report"; font: 8pt "Inter Variable", "Inter", system-ui, sans-serif; color: #8a8c83; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 8pt "Inter Variable", "Inter", system-ui, sans-serif; color: #8a8c83; } }
:root { --ink: #1c1d1a; --ink-2: #3a3c36; --muted: #686a62; --faint: #8a8c83; --line: #e7e4d6; --accent: #3f5443; --accent-soft: #eef3ec; --warm: #faf8f2; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #fff; color: var(--ink-2); font: 10.5pt/1.62 "Inter Variable", "Inter", "Segoe UI", system-ui, -apple-system, sans-serif; }
main { max-width: 172mm; margin: 0 auto; }
.serif, h1, h2, h3 { font-family: "Instrument Serif", "Iowan Old Style", Georgia, "Times New Roman", serif; font-weight: 400; color: var(--ink); }
header.cover { padding-bottom: 14pt; border-bottom: 1px solid var(--line); margin-bottom: 18pt; }
.eyebrow { font-size: 7.5pt; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); font-weight: 600; margin: 0 0 10pt; }
h1 { font-size: 27pt; line-height: 1.12; margin: 0 0 10pt; letter-spacing: -.005em; }
.question { margin: 0 0 10pt; padding-left: 10pt; border-left: 2px solid var(--line); color: var(--muted); font-style: italic; }
.meta { margin: 0; font-size: 8.5pt; color: var(--faint); }
.meta span + span::before { content: "·"; margin: 0 6pt; }
h2 { font-size: 16pt; margin: 22pt 0 8pt; padding-bottom: 4pt; border-bottom: 1px solid var(--line); break-after: avoid; }
h3 { font-size: 12.5pt; margin: 14pt 0 4pt; break-after: avoid; }
p { margin: 0 0 8pt; orphans: 3; widows: 3; }
.summary { background: var(--accent-soft); border-left: 3px solid var(--accent); border-radius: 0 6px 6px 0; padding: 11pt 14pt 3pt; color: var(--ink); }
.finding { display: grid; grid-template-columns: 26pt 1fr; gap: 0 8pt; padding: 9pt 0; border-bottom: 1px solid var(--line); break-inside: avoid; }
.finding:last-child { border-bottom: 0; }
.finding .num { font-family: "Instrument Serif", Georgia, serif; font-size: 18pt; line-height: 1; color: var(--accent); }
.finding h3 { margin: 0 0 3pt; font-family: inherit; font-size: 10.5pt; font-weight: 600; color: var(--ink); }
.finding p { margin: 0; }
.limitations { background: var(--warm); border: 1px solid var(--line); border-radius: 6px; padding: 9pt 14pt 9pt 26pt; margin: 0; color: var(--muted); font-size: 9.5pt; }
.limitations li + li { margin-top: 4pt; }
.keywords { margin: 0 0 8pt; font-size: 9pt; color: var(--muted); }
.keywords b { color: var(--ink-2); font-weight: 600; }
h2 .sn { color: var(--accent); margin-right: 7pt; }
ul.bullets { margin: 0 0 8pt; padding-left: 15pt; }
ul.bullets li + li { margin-top: 3pt; }
figure { margin: 12pt 0 14pt; break-inside: avoid; }
figcaption { font-size: 8.6pt; line-height: 1.5; color: var(--muted); margin-top: 6pt; }
figcaption b { color: var(--ink-2); }
figcaption a { color: var(--accent); text-decoration: none; }
.tbl figcaption { margin: 0 0 6pt; }
table.data { width: 100%; border-collapse: collapse; font-size: 8.6pt; line-height: 1.45; }
table.data th { text-align: left; background: var(--accent-soft); color: var(--ink); font-weight: 600; padding: 5pt 7pt; border-bottom: 1.2px solid var(--accent); }
table.data td { padding: 5pt 7pt; border-bottom: 1px solid var(--line); vertical-align: top; color: var(--ink-2); }
table.data td:first-child { color: var(--ink); font-weight: 500; }
table.data tr:nth-child(even) td { background: #fcfbf7; }
.diagram { border: 1px solid var(--line); border-radius: 6px; padding: 10pt; text-align: center; background: #fff; }
.diagram svg { max-width: 100%; height: auto; max-height: 150mm; }
.fig img { display: block; margin: 0 auto; max-width: 100%; max-height: 110mm; border: 1px solid var(--line); border-radius: 4px; }
sup.cite { font-size: 6.5pt; line-height: 0; margin-left: 1pt; }
sup.cite a { color: var(--accent); text-decoration: none; font-weight: 600; }
.cite-ad { color: var(--accent); }
ol.sources { list-style: none; margin: 0; padding: 0; font-size: 8.8pt; }
ol.sources li { display: grid; grid-template-columns: 20pt 1fr; gap: 0 6pt; padding: 5pt 0; border-bottom: 1px solid var(--line); break-inside: avoid; }
ol.sources .n { color: var(--accent); font-weight: 600; }
ol.sources .t { color: var(--ink); font-weight: 500; }
ol.sources .s { color: var(--muted); }
ol.sources .u { color: var(--accent); word-break: break-all; text-decoration: none; }
.tag { display: inline-block; font-size: 6.8pt; letter-spacing: .05em; text-transform: uppercase; color: var(--accent); background: var(--accent-soft); border-radius: 3px; padding: 0 4pt; margin-left: 4pt; vertical-align: 1px; }
`;

export function toPrintHtml(d: ExportDocument): string {
  const numeric = d.style === "numeric";
  const sources = d.sources
    .map((s) => {
      const line = numeric
        ? `<span class="t">${h(s.title)}</span> <span class="s">— ${h([s.authors.slice(0, 3).join(", "), s.publisher, s.year].filter(Boolean).join(", "))}</span><span class="tag">${h(s.type)}</span>`
        : `<span class="t">${h(s.reference.replace(s.url, "").trim())}</span>`;
      const url = s.url ? `<br><a class="u" href="${h(s.url)}">${h(s.url)}</a>` : "";
      return `<li id="src-${s.number}">${numeric ? `<span class="n">${s.number}</span>` : `<span class="n">•</span>`}<div>${line}${url}</div></li>`;
    })
    .join("");
  const meta = `<p class="meta">${[d.mode, d.date, `${d.sources.length} sources cited`].filter(Boolean).map((m) => `<span>${h(m)}</span>`).join("")}</p>`;
  const cover = [
    `<header class="cover"><p class="eyebrow">Pramaan AI · ${d.paper ? "Research paper" : "Research report"}</p><h1>${h(d.title)}</h1>`,
    d.question && d.question !== d.title ? `<p class="question">${h(d.question)}</p>` : "",
    d.keywords.length ? `<p class="keywords"><b>Keywords:</b> ${d.keywords.map(h).join(" · ")}</p>` : "",
    `${meta}</header>`,
  ].join("");
  const references = d.sources.length ? `<section><h2>${d.paper || !numeric ? "References" : "Sources"}</h2><ol class="sources">${sources}</ol></section>` : "";
  const body = d.paper
    ? [
        cover,
        d.summary.length ? `<section><h2>Abstract</h2><div class="summary">${d.summary.map((p) => `<p>${runs(p, d)}</p>`).join("")}</div></section>` : "",
        ...d.sections.map((sec) => `<section><h2><span class="sn">${sec.number}</span>${h(sec.heading)}</h2>${sec.blocks.map((b) => block(b, d)).join("")}</section>`),
        references,
      ].join("")
    : [
        cover,
        d.summary.length ? `<section><h2>Executive summary</h2><div class="summary">${d.summary.map((p) => `<p>${runs(p, d)}</p>`).join("")}</div></section>` : "",
        d.findings.length
          ? `<section><h2>Key findings</h2>${d.findings
              .map((f, i) => `<div class="finding"><span class="num">${String(i + 1).padStart(2, "0")}</span><div><h3>${h(f.title)}</h3><p>${runs(f.body, d)}</p></div></div>`)
              .join("")}</section>`
          : "",
        d.analysis.length
          ? `<section><h2>Analysis</h2>${d.analysis.map((a) => `<h3>${h(a.heading)}</h3>${a.paragraphs.map((p) => `<p>${runs(p, d)}</p>`).join("")}`).join("")}</section>`
          : "",
        d.limitations.length ? `<section><h2>Limitations</h2><ul class="limitations">${d.limitations.map((l) => `<li>${runs(l, d)}</li>`).join("")}</ul></section>` : "",
        references,
      ].join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${h(d.title)}</title><style>${brandFonts()}${STYLES}</style></head><body><main>${body}</main></body></html>`;
}

/** Opens the browser's print dialog for the report alone (choose "Save as PDF"). */
export async function printReport(doc: ExportDocument): Promise<void> {
  const d = doc.paper ? await withDiagrams(doc) : doc;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "Report for printing";
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden" });
  const loaded = new Promise<void>((resolve) => frame.addEventListener("load", () => resolve(), { once: true }));
  frame.srcdoc = toPrintHtml(d);
  document.body.appendChild(frame);
  await loaded;
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    throw new Error("Printing isn't available in this browser.");
  }
  await win.document.fonts?.ready;
  // Figures load from their sources: wait for them (briefly) so they aren't printed blank.
  const images = Array.from(win.document.images).filter((img) => !img.complete);
  await Promise.race([
    Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          }),
      ),
    ),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 120_000); // in case afterprint never fires
  win.focus();
  win.print();
}
