import { describe, expect, it } from "vitest";
import { citedIndices, parseRichText, stripCitations } from "@/lib/utils/citations";

describe("citation parsing", () => {
  it("splits text and citation markers", () => {
    expect(parseRichText("Costs fell [3], then rose [1][2].")).toEqual([
      { type: "text", value: "Costs fell " },
      { type: "cite", index: 3 },
      { type: "text", value: ", then rose " },
      { type: "cite", index: 1 },
      { type: "cite", index: 2 },
      { type: "text", value: "." },
    ]);
  });
  it("collects unique cited indices in order", () => {
    expect(citedIndices(["a [2]", "b [1][2]"])).toEqual([1, 2]);
  });
  it("strips markers for plain-text export", () => {
    expect(stripCitations("Claim [1][4].")).toBe("Claim.");
  });
});
