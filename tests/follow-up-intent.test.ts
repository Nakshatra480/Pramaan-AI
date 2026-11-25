import { describe, expect, it } from "vitest";
import { followUpKind, revisionLength } from "@/lib/utils/follow-up-intent";

describe("follow-up routing (demo mode — mirrors the backend fallback)", () => {
  it.each(["Make the report shorter", "Rewrite it for executives", "Can you make this more detailed?", "Focus more on India", "Put the findings in bullet points", "add a section on costs"])(
    "revises: %s",
    (q) => expect(followUpKind(q)).toBe("revise"),
  );
  it.each(["Which automakers run pilots?", "Why did costs fall?", "What about Europe?", "Is the report too short?", "How does this compare with industrial arms?"])(
    "answers: %s",
    (q) => expect(followUpKind(q)).toBe("question"),
  );
  it("reads the requested length", () => {
    expect(revisionLength("make it shorter")).toBe("concise");
    expect(revisionLength("go more in-depth")).toBe("comprehensive");
    expect(revisionLength("focus on India")).toBeNull();
  });
});
