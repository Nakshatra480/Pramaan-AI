import { describe, expect, it } from "vitest";
import { buildExportDocument, inlines, plain } from "@/lib/export/document";
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
