import { describe, expect, it } from "vitest";
import { RESEARCH } from "@/data/research";
import { buildNarration, chunkText, estimateMinutes, MAX_CHUNK, sectionStart, speakable } from "@/lib/speech/narration";
import { appendDictation, transcriptOf, voiceEngine, voiceErrorMessage } from "@/lib/speech/recognition";
import type { Research } from "@/types";

const research = RESEARCH.find((r) => r.report) as Research;

describe("narration script", () => {
  const chunks = buildNarration(research);

  it("reads the whole report in order", () => {
    const order = [...new Set(chunks.map((c) => c.sectionId))];
    expect(order).toEqual(["top", "summary", "findings", "analysis", "evidence", "limitations", "end"].filter((s) => order.includes(s)));
    expect(order).toEqual(expect.arrayContaining(["top", "summary", "findings", "limitations", "end"]));
    expect(chunks[0].text).toContain(speakable(research.title).slice(0, 20));
    expect(chunks.at(-1)!.text).toBe("End of report.");
  });

  it("never reads citation markers, markdown or links aloud", () => {
    for (const c of chunks) {
      expect(c.text).not.toMatch(/\[\d+\]|\[C\d+\]|\*\*|https?:\/\//);
      expect(c.text.length).toBeLessThanOrEqual(MAX_CHUNK);
      expect(c.text.trim()).toBe(c.text);
    }
  });

  it("numbers findings and states each claim's verification", () => {
    expect(chunks.some((c) => c.sectionId === "findings" && c.text.startsWith("Finding 1:"))).toBe(true);
    if (research.claims.length) expect(chunks.some((c) => /^Claim 1, (supported|partially supported|not supported|insufficient evidence):/.test(c.text))).toBe(true);
  });

  it("is empty without a report", () => {
    expect(buildNarration({ ...research, report: undefined })).toEqual([]);
  });

  it("estimates listening time", () => {
    expect(estimateMinutes(chunks, 1)).toBeGreaterThanOrEqual(estimateMinutes(chunks, 2));
  });
});

describe("speakable", () => {
  it("strips citations in all formats", () => {
    expect(speakable("Prices rose 4% [1][2], then fell [3, 4]. Claims hold [C2].")).toBe("Prices rose 4%, then fell. Claims hold.");
  });
  it("keeps link text, drops URLs and markdown", () => {
    expect(speakable("See **the [IEA report](https://iea.org/x)** — https://example.com now")).toBe("See the IEA report, now");
  });
});

describe("chunkText", () => {
  it("groups short sentences and never exceeds the limit", () => {
    const text = "One. Two is here. " + "A much longer sentence that keeps going, with clauses, and more clauses, ".repeat(6) + "Done.";
    const out = chunkText(text, 120);
    expect(out[0].startsWith("One. Two is here.")).toBe(true);
    expect(out.every((c) => c.length <= 120)).toBe(true);
    expect(out.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " ").trim());
  });
  it("splits a single huge word run safely", () => {
    expect(chunkText("word ".repeat(200).trim(), 50).every((c) => c.length <= 50)).toBe(true);
  });
});

describe("sectionStart", () => {
  const cs = ["a", "a", "a", "b", "b", "c"].map((sectionId) => ({ sectionId, sectionLabel: sectionId, text: "x" }));
  it("skips forward to the next section", () => {
    expect(sectionStart(cs, 0, 1)).toBe(3);
    expect(sectionStart(cs, 4, 1)).toBe(5);
    expect(sectionStart(cs, 5, 1)).toBe(6); // past the end → stop
  });
  it("goes back to this section's start, or the previous section when already there", () => {
    expect(sectionStart(cs, 2, -1)).toBe(0);
    expect(sectionStart(cs, 3, -1)).toBe(0);
    expect(sectionStart(cs, 4, -1)).toBe(0);
    expect(sectionStart(cs, 5, -1)).toBe(3);
    expect(sectionStart(cs, 0, -1)).toBe(0);
  });
});

describe("dictation", () => {
  it("joins live recognition results", () => {
    const r = (t: string, isFinal: boolean) => ({ 0: { transcript: t }, isFinal });
    expect(transcriptOf([r("what is the", true), r(" evidence for  heat pumps", false)])).toEqual({ text: "what is the evidence for heat pumps", final: false });
    expect(transcriptOf([r("done", true)]).final).toBe(true);
  });
  it("appends to typed text with spacing and capitals", () => {
    expect(appendDictation("", "how do heat pumps work")).toBe("How do heat pumps work");
    expect(appendDictation("Compare heat pumps", "in cold climates")).toBe("Compare heat pumps in cold climates");
    expect(appendDictation("Context first.  ", "what changed")).toBe("Context first. What changed");
    expect(appendDictation("keep", "   ")).toBe("keep");
  });
  it("explains errors in plain language and ignores benign ones", () => {
    expect(voiceErrorMessage("no-speech")).toBeNull();
    expect(voiceErrorMessage("aborted")).toBeNull();
    expect(voiceErrorMessage("not-allowed")).toMatch(/Microphone access is blocked/);
    expect(voiceErrorMessage("NotFoundError")).toMatch(/No microphone/);
  });
  it("has no engine outside a browser", () => {
    expect(voiceEngine(true)).toBeNull();
  });
});
