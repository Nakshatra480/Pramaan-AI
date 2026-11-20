/** Follow-ups appear the moment they're asked, then hand over to the server's copy. */
import { describe, expect, it } from "vitest";
import { pendingFollowUps, visiblePending } from "@/lib/utils/pending-follow-ups";

describe("pending follow-ups", () => {
  it("shows a question instantly and drops it once the server copy has loaded", () => {
    const key = pendingFollowUps.add("r1", "Which findings will change?");
    expect(visiblePending(pendingFollowUps.snapshot(), "r1", []).map((p) => p.question)).toEqual(["Which findings will change?"]);
    expect(visiblePending(pendingFollowUps.snapshot(), "r2", [])).toEqual([]); // scoped to its research

    pendingFollowUps.accept(key, "srv-1");
    expect(visiblePending(pendingFollowUps.snapshot(), "r1", [])).toHaveLength(1); // still shown until the reload includes it
    expect(visiblePending(pendingFollowUps.snapshot(), "r1", ["srv-1"])).toEqual([]); // never shown twice

    pendingFollowUps.settle(["srv-1"]);
    expect(pendingFollowUps.snapshot().some((p) => p.key === key)).toBe(false);
  });

  it("removes a follow-up that couldn't be sent", () => {
    const key = pendingFollowUps.add("r1", "Will fail");
    pendingFollowUps.remove(key);
    expect(visiblePending(pendingFollowUps.snapshot(), "r1", [])).toEqual([]);
  });

  it("keeps the snapshot stable between changes (no re-render loops)", () => {
    const a = pendingFollowUps.snapshot();
    pendingFollowUps.settle([]);
    expect(pendingFollowUps.snapshot()).toBe(a);
  });
});
