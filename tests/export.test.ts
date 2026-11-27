import { describe, expect, it } from "vitest";
import { answerText, buildExportDocument, inlines, plain } from "@/lib/export/document";
import { toDocx } from "@/lib/export/docx";
import { toMarkdown } from "@/lib/export/markdown";
import { toPrintHtml } from "@/lib/export/pdf";
import type { Research, Source } from "@/types";

const src = (id: string, extra: Partial<Source> = {}): Source => ({
  id,
  title: `Study ${id}`,
  domain: `${id}.example`,
  url: `https://${id}.example/paper_${id}`,
  publisher: `Journal ${id.toUpperCase()}`,
  type: "academic",
  relevance: 0.9,
  publishedAt: "2024-05-01",
  ...extra,
});
const sources = [src("a", { authors: ["Asha Rao"] }), src("b", { type: "encyclopedia", publisher: "Wikipedia" }), src("c")];

const research = {
  id: "r1",
  title: "Solid-state batteries",
  query: "When will solid-state batteries reach mass production?",
  mode: "standard",
  channels: ["web"],
  status: "complete",
  createdAt: "2026-11-20T10:00:00Z",
  completedAt: "2026-11-20T10:02:00Z",
  saved: false,
  visibility: "private",
  metrics: { sources: 40, evidence: 50, candidateClaims: 10, verifiedClaims: 9 },
  sourceIds: ["a", "b", "c"],
  evidence: [],
  claims: [],
  followUps: [{ id: "f1", question: "What about costs?", answer: ["Costs fall [1]."], status: "complete", createdAt: "", kind: "answer", revisionId: null, sources: [] }],
  report: {
    summary: ["Toyota targets 2027 [1] [2][2]. A *bold* claim_with_underscores [9]."],
    findings: [{ title: "Limited production", body: "Pilot lines met targets [1]." }],
    analysis: [{ heading: "Outlook", paragraphs: ["Costs stay high [2]."] }],
    limitations: ["Few independent sources."],
    citations: [
      { index: 1, sourceId: "a" },
      { index: 2, sourceId: "b" },
    ],
  },
} as unknown as Research;

describe("export document", () => {
  const d = buildExportDocument(research, sources);

  it("holds only the report and the sources it cites", () => {
    expect(d.sources.map((s) => s.number)).toEqual([1, 2]); // "c" is not cited; marker [9] has no source
    expect(JSON.stringify(d)).not.toContain("What about costs"); // follow-ups are not part of the export
    expect(d.mode).toBe("Standard research");
    expect(d.date).toBe("20 November 2026");
  });

  it("merges adjacent citation markers and drops unknown ones", () => {
    expect(d.summary[0]).toEqual([
      { kind: "text", text: "Toyota targets 2027" },
      { kind: "cite", numbers: [1, 2], label: "1, 2" },
      { kind: "text", text: ". A *bold* claim_with_underscores." },
    ]);
    expect(plain(d.summary[0], "numeric")).toBe("Toyota targets 2027 [1, 2]. A *bold* claim_with_underscores.");
  });

  it("compresses long citation runs and hides a question that repeats the title", async () => {
    const { numberRanges } = await import("@/lib/export/document");
    expect(numberRanges([1, 2, 3, 4, 5, 9, 10])).toBe("1–5, 9, 10");
    expect(numberRanges([3, 1, 2])).toBe("1–3");
    const same = buildExportDocument({ ...research, title: "How effective is carbon capture", query: "How effective is carbon capture?" } as Research, sources);
    expect(same.question).toBe("");
    expect(d.question).toBe("When will solid-state batteries reach mass production?");
  });

  it("uses the chosen citation style in text and references", () => {
    const apa = buildExportDocument(research, sources, "apa");
    expect(plain(apa.findings[0].body, "apa")).toBe("Pilot lines met targets (Rao, 2024).");
    expect(apa.sources.find((s) => s.number === 1)?.reference).toBe("Asha Rao (2024). Study a. Journal A. https://a.example/paper_a");
    const byNumber = new Map([[1, sources[0]]]);
    expect(inlines("x [1]", "mla", byNumber)).toEqual([{ kind: "text", text: "x" }, { kind: "cite", numbers: [1], label: "Rao" }]);
  });

  it("markdown: sections, escaped prose and intact links", () => {
    const md = toMarkdown(d);
    expect(md).toMatch(/^# Solid-state batteries\n\n> \*\*Research question:\*\* When will/);
    expect(md).toContain("## Executive summary\n\nToyota targets 2027 [1, 2]. A \\*bold\\* claim\\_with\\_underscores.");
    expect(md).toContain("### 1. Limited production");
    expect(md).toContain("1. Study a. Journal A, 2024. <https://a.example/paper_a>"); // URL not escaped
    expect(md).not.toMatch(/Research again|Follow-up|verified claims/);
  });

  it("print document: styled, report-only, cites link to the source list", () => {
    const html = toPrintHtml(d);
    expect(html).toContain("<title>Solid-state batteries</title>");
    expect(html).toContain('<sup class="cite"><a href="#src-1">1, 2</a></sup>');
    expect(html).toContain('id="src-2"');
    expect(html).toContain("Wikipedia");
    expect(html).not.toContain("What about costs");
  });

  it("word: a real .docx with the report text", async () => {
    const blob = await toDocx(d);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("word/document.xml");
  });
});

describe("export of a research paper", () => {
  const paperReport = {
    ...research,
    title: "solid state batteries",
    report: {
      format: "paper",
      title: "Production timelines of solid-state batteries",
      keywords: ["solid-state batteries", "Toyota"],
      summary: ["Toyota targets 2027 [1]."],
      findings: [],
      analysis: [],
      sections: [
        { heading: "Introduction", blocks: [{ type: "paragraph", text: "Context [1]." }] },
        {
          heading: "Manufacturer plans",
          blocks: [
            { type: "paragraph", text: "Plans differ [2]." },
            { type: "table", caption: "Announced targets", columns: ["Maker", "Year | note"], rows: [["Toyota", "2027 [1]"], ["Other", "2030 [2]"]] },
            { type: "diagram", caption: "Path to production [1]", code: 'flowchart LR\n    n1["Pilot"] --> n2["Scale"]' },
            { type: "figure", caption: "A pilot line", url: "https://img.example/p.jpg", credit: "Journal B", sourceUrl: "https://b.example/page", sourceIndex: 2 },
          ],
        },
        { heading: "Conclusion", blocks: [{ type: "paragraph", text: "Soon [1]." }] },
      ],
      limitations: ["Few sources."],
      citations: [
        { index: 1, sourceId: "a" },
        { index: 2, sourceId: "b" },
      ],
    },
  } as unknown as Research;
  const d = buildExportDocument(paperReport, sources);

  it("numbers sections, puts limitations before the conclusion and labels visuals", () => {
    expect(d.paper && d.title === "Production timelines of solid-state batteries").toBe(true);
    expect(d.sections.map((s) => `${s.number} ${s.heading}`)).toEqual(["1 Introduction", "2 Manufacturer plans", "3 Limitations", "4 Conclusion"]);
    const labels = d.sections[1].blocks.map((b) => ("label" in b ? b.label : b.kind));
    expect(labels).toEqual(["paragraph", "Table 1", "Figure 1", "Figure 2"]);
    expect(d.keywords).toEqual(["solid-state batteries", "Toyota"]);
  });

  it("markdown: abstract, numbered sections, a GFM table, a Mermaid block and a credited figure", () => {
    const md = toMarkdown(d);
    expect(md).toContain("## Abstract\n\nToyota targets 2027 [1].");
    expect(md).toContain("## 2. Manufacturer plans");
    expect(md).toContain("**Table 1.** Announced targets\n\n| Maker | Year \\| note |\n| --- | --- |\n| Toyota | 2027 [1] |");
    expect(md).toContain('```mermaid\nflowchart LR\n    n1["Pilot"] --> n2["Scale"]\n```\n\n*Figure 1. Path to production [1]*');
    expect(md).toContain("![A pilot line](<https://img.example/p.jpg>)\n\n*Figure 2. A pilot line. Source: [Journal B](<https://b.example/page>) [2]*");
    expect(md).toContain("## 3. Limitations\n\n- Few sources.");
    expect(md).toContain("## References");
    expect(md).not.toMatch(/Executive summary|Key findings/);
  });

  it("print document: abstract, data table and figure; a diagram without its SVG is left out", () => {
    const html = toPrintHtml(d);
    expect(html).toContain("<h2>Abstract</h2>");
    expect(html).toContain('<h2><span class="sn">2</span>Manufacturer plans</h2>');
    expect(html).toContain('<table class="data"><thead><tr><th>Maker</th><th>Year | note</th></tr></thead>');
    expect(html).toContain('<img src="https://img.example/p.jpg" alt="A pilot line" referrerpolicy="no-referrer">');
    expect(html).not.toContain('class="diagram"');
    const withSvg = toPrintHtml({ ...d, sections: d.sections.map((s) => ({ ...s, blocks: s.blocks.map((b) => (b.kind === "diagram" ? { ...b, svg: "<svg></svg>" } : b)) })) });
    expect(withSvg).toContain('<div class="diagram"><svg></svg></div><figcaption><b>Figure 1.</b>');
  });

  it("word: a real .docx with the paper's sections and table", async () => {
    const blob = await toDocx(d);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });

  it("copy answer: the abstract", () => {
    expect(answerText(d)).toBe("Production timelines of solid-state batteries\n\nToyota targets 2027 [1].");
  });
});
