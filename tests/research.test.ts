import { describe, expect, it } from "vitest";
import { RESEARCH } from "@/data/research";
import { SOURCES } from "@/data/sources";
import { filterHistory } from "@/lib/utils/history";
import { citedIndices } from "@/lib/utils/citations";

describe("mock research data integrity", () => {
  it("every citation in every report resolves to a known source", () => {
    const ids = new Set(SOURCES.map((s) => s.id));
    for (const r of RESEARCH.filter((x) => x.report)) {
      const rep = r.report!;
      const texts = [...rep.summary, ...rep.findings.map((f) => f.body), ...rep.analysis.flatMap((a) => a.paragraphs), ...rep.limitations];
      for (const i of citedIndices(texts)) {
        expect(i, `${r.id} cites [${i}]`).toBeLessThanOrEqual(r.sourceIds.length);
        expect(ids.has(r.sourceIds[i - 1])).toBe(true);
      }
    }
  });
  it("has the required mix of claim statuses", () => {
    const statuses = new Set(RESEARCH.flatMap((r) => r.claims.map((c) => c.status)));
    expect(statuses).toContain("supported");
    expect(statuses).toContain("partially_supported");
    expect(statuses).toContain("insufficient_evidence");
  });
});

describe("history filtering", () => {
  it("filters saved and sorts by verified claims", () => {
    const saved = filterHistory(RESEARCH, { filter: "saved", sort: "verified" });
    expect(saved.every((r) => r.saved)).toBe(true);
    expect(saved[0].metrics.verifiedClaims).toBeGreaterThanOrEqual(saved[saved.length - 1].metrics.verifiedClaims);
  });
  it("surfaces failed sessions under needs attention", () => {
    const ids = filterHistory(RESEARCH, { filter: "attention" }).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["r-chip-export-controls", "r-lithium-2035", "r-artisan-coffee"]));
  });
});
