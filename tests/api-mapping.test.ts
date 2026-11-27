import { describe, expect, it } from "vitest";
import { toUiStatus } from "@/lib/api/research";

describe("backend → UI research status mapping", () => {
  it("maps every in-progress backend state to running", () => {
    for (const s of ["queued", "planning", "searching", "retrieving", "extracting", "verifying", "synthesizing", "citing"] as const) {
      expect(toUiStatus(s)).toBe("running");
    }
  });
  it("maps terminal states and error codes to the existing error screens", () => {
    expect(toUiStatus("completed")).toBe("complete");
    expect(toUiStatus("failed", "NO_SOURCES")).toBe("no_sources");
    expect(toUiStatus("failed", "TIMEOUT")).toBe("timeout");
    expect(toUiStatus("failed", "INTERNAL")).toBe("failed");
    expect(toUiStatus("cancelled")).toBe("failed");
  });
});

describe("restart / model failure mapping", () => {
  it("treats interrupted as transient (requeued) and keeps model failures on the error screen", () => {
    expect(toUiStatus("interrupted")).toBe("running");
    expect(toUiStatus("failed", "MODEL_UNAVAILABLE")).toBe("failed");
    expect(toUiStatus("failed", "INTERRUPTED")).toBe("failed");
  });
});

describe("paper report blocks from the API", () => {
  const base = { text: null, items: null, caption: null, columns: null, rows: null, code: null, url: null, credit: null, sourceUrl: null, sourceIndex: null };
  it("maps blocks, drops malformed ones and the source's own figure numbering", async () => {
    const { toBlock, toReport } = await import("@/lib/api/research");
    expect(toBlock({ ...base, type: "paragraph", text: "Text [1]." })).toEqual({ type: "paragraph", text: "Text [1]." });
    expect(toBlock({ ...base, type: "paragraph" })).toBeNull();
    expect(toBlock({ ...base, type: "figure", url: "http://insecure.example/a.jpg", caption: "x" })).toBeNull(); // https only
    expect(toBlock({ ...base, type: "figure", url: "https://img.example/a.jpg", caption: "Figure 1. General schematic", credit: "Lab", sourceUrl: "https://lab.example", sourceIndex: 2 })).toEqual({
      type: "figure",
      caption: "General schematic",
      url: "https://img.example/a.jpg",
      credit: "Lab",
      sourceUrl: "https://lab.example",
      sourceIndex: 2,
    });
    expect(toBlock({ ...base, type: "table", caption: "Table 2: Costs", columns: ["A"], rows: [["1"]] })).toMatchObject({ caption: "Costs" });
    const legacy = toReport({ summary: ["s"], findings: [], analysis: [], limitations: [], citations: [] });
    expect(legacy.format).toBe("legacy");
    expect(legacy.sections).toEqual([]);
  });
});
