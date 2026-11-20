/** Sign-in waits on a sleeping free-tier API: prewarm it once, report "waking" when slow, never throw. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example");
  vi.stubGlobal("window", {});
  return import("@/lib/api/warmup");
}

describe("prewarmBackend", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("calls GET /ready once per page load", async () => {
    const w = await load();
    const f = vi.fn(async () => new Response("{}"));
    await Promise.all([w.prewarmBackend(f as unknown as typeof fetch), w.prewarmBackend(f as unknown as typeof fetch)]);
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as unknown[])[0]).toBe("https://api.example/ready");
    expect(w.backendState.get()).toBe("ready");
  });

  it("reports waking when the server is slow, then ready", async () => {
    const w = await load();
    let finish!: () => void;
    const f = vi.fn(() => new Promise<Response>((res) => (finish = () => res(new Response("{}")))));
    const p = w.prewarmBackend(f as unknown as typeof fetch);
    expect(w.backendState.get()).toBe("checking");
    vi.advanceTimersByTime(3000);
    expect(w.backendState.get()).toBe("waking");
    finish();
    await p;
    expect(w.backendState.get()).toBe("ready");
  });

  it("never throws when the server is unreachable", async () => {
    const w = await load();
    await expect(w.prewarmBackend((async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).resolves.toBeUndefined();
    expect(w.backendState.get()).toBe("idle");
  });

  it("does nothing in demo mode", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "mock");
    const w = await import("@/lib/api/warmup");
    const f = vi.fn();
    await w.prewarmBackend(f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
});
