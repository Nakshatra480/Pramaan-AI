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
