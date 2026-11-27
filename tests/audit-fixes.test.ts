/** Regression tests for frontend fixes from the product audit (C-01…L-14). */
import { describe, expect, it } from "vitest";
import { pollDelay } from "@/lib/api/library";
import { validationMessage } from "@/lib/api/client";
import { DEFAULT_PREFERENCES } from "@/lib/mock/preferences";
import { nextReset } from "@/lib/mock/account";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";
import { citationLabel } from "@/lib/utils/citations";
import { notificationKinds } from "@/lib/utils/notifications";
import { mergeStoredPreferences } from "@/lib/utils/preferences";
import { safeNext } from "@/lib/utils/redirect";
import { rejectionMessage, splitUploads, UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, uploadProblem } from "@/lib/utils/uploads";
import { validateSignIn, validateSignUp } from "@/lib/utils/validation";

describe("M-01 sign-in deep links", () => {
  it("keeps safe in-app paths", () => {
    expect(safeNext("/library")).toBe("/library");
    expect(safeNext("/research/abc?source=1#x")).toBe("/research/abc?source=1#x");
  });
  it("rejects other origins, auth loops and junk", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "evil", "/auth/login", "/auth", "/a\u0000b", null, ""]) expect(safeNext(bad)).toBe("/app");
  });
});

describe("M-02 preferences from the profile", () => {
  it("applies valid stored values and ignores invalid or unknown ones", () => {
    const merged = mergeStoredPreferences(DEFAULT_PREFERENCES, {
      defaultMode: "quick",
      citationStyle: "apa",
      responseLength: "loud",
      retentionDays: 45,
      defaultChannels: [],
      notifications: { researchComplete: false },
      theme: "dark", // per-device: not synced
      ai: { provider: "ollama" },
    });
    expect(merged.defaultMode).toBe("quick");
    expect(merged.citationStyle).toBe("apa");
    expect(merged.responseLength).toBe(DEFAULT_PREFERENCES.responseLength);
    expect(merged.retentionDays).toBe(0);
    expect(merged.defaultChannels).toEqual(DEFAULT_PREFERENCES.defaultChannels);
    expect(merged.notifications).toEqual({ researchComplete: false, documentIndexed: true });
    expect(merged.theme).toBe(DEFAULT_PREFERENCES.theme);
    expect("ai" in merged).toBe(false);
  });
  it("tolerates missing or non-object data", () => {
    expect(mergeStoredPreferences(DEFAULT_PREFERENCES, null)).toBe(DEFAULT_PREFERENCES);
    expect(mergeStoredPreferences(DEFAULT_PREFERENCES, "x")).toBe(DEFAULT_PREFERENCES);
  });
  it("L-14: defaults no longer mention Ollama, local URLs or a fake model", () => {
    expect(JSON.stringify(DEFAULT_PREFERENCES)).not.toMatch(/ollama|localhost|nomic|pramaan-research-1/i);
  });
});

describe("H-05 settings do what they say", () => {
  it("citation styles render author–date labels", () => {
    const s = { title: "Learned locomotion transfer", publisher: "Science Robotics", authors: ["Lea Moreau", "Ken Tanaka", "Anaya Iyer"], publishedAt: "2026-03-02" };
    expect(citationLabel(s, "numeric", 3)).toBe("3");
    expect(citationLabel(s, "apa", 3)).toBe("Moreau et al., 2026");
    expect(citationLabel(s, "mla", 3)).toBe("Moreau et al.");
    expect(citationLabel(s, "chicago", 3)).toBe("Moreau, Tanaka, and Iyer 2026");
    expect(citationLabel({ ...s, authors: ["Moreau, Lea", "Tanaka, Ken"] }, "apa", 1)).toBe("Moreau & Tanaka, 2026");
    expect(citationLabel({ title: "Pramaan Docs Retention Policy", publisher: "Meridian" }, "apa", 1)).toBe("Meridian, n.d.");
    expect(citationLabel({ title: "Pramaan Docs Retention Policy", publisher: "" }, "mla", 1)).toBe("“Pramaan Docs Retention Policy”");
  });
  it("notification switches control what the bell shows", () => {
    expect(notificationKinds({ researchComplete: true, documentIndexed: true })).toEqual(["research_completed", "document_added"]);
    expect(notificationKinds({ researchComplete: false, documentIndexed: true })).toEqual(["document_added"]);
    expect(notificationKinds({ researchComplete: false, documentIndexed: false })).toEqual([]);
  });
  it("billing reset date is computed, not hardcoded", () => {
    expect(nextReset("2026-11-01T00:00:00Z").toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(nextReset("2026-12-01T00:00:00Z").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("H-04 indexing polls are bounded", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  it("backs off and stops", () => {
    expect(pollDelay([{ status: "ready", addedAt: at(0) }], now)).toBeNull();
    expect(pollDelay([{ status: "extracting", addedAt: at(10_000) }], now)).toBe(1500);
    expect(pollDelay([{ status: "embedding", addedAt: at(3 * 60_000) }], now)).toBe(5000);
    expect(pollDelay([{ status: "indexing", addedAt: at(10 * 60_000) }], now)).toBe(15_000);
    expect(pollDelay([{ status: "extracting", addedAt: at(30 * 60_000) }], now)).toBeNull();
    expect(pollDelay([{ status: "extracting", addedAt: at(30 * 60_000) }, { status: "uploading", addedAt: at(1000) }], now)).toBe(1500);
  });
});

describe("M-09 / L-07 upload rules match the server", () => {
  it("accepts exactly PDF, DOCX, TXT, Markdown up to 20 MB", () => {
    expect(UPLOAD_ACCEPT).not.toContain(".doc,");
    expect(UPLOAD_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(uploadProblem({ name: "a.pdf", size: 10 })).toBeNull();
    expect(uploadProblem({ name: "a.markdown", size: 10 })).toBeNull();
    expect(uploadProblem({ name: "a.doc", size: 10 })).toBe("type");
    expect(uploadProblem({ name: "a.pdf", size: 21 * 1024 * 1024 })).toBe("size");
    expect(uploadProblem({ name: "a.txt", size: 0 })).toBe("empty");
  });
  it("explains each rejection", () => {
    const { ok, rejected } = splitUploads([
      { name: "ok.md", size: 5 },
      { name: "old.doc", size: 5 },
      { name: "big.pdf", size: 30 * 1024 * 1024 },
    ]);
    expect(ok.map((f) => f.name)).toEqual(["ok.md"]);
    expect(rejectionMessage(rejected)).toBe("old.doc (unsupported type), big.pdf (over 20 MB). Supported: PDF, DOCX, TXT and Markdown · up to 20 MB.");
  });
});

describe("M-07 validation errors are specific", () => {
  it("names the field and the limit", () => {
    expect(validationMessage([{ field: "query", message: "String should have at most 2000 characters" }])).toBe("Question: Use at most 2,000 characters.");
    expect(validationMessage([{ field: "body.title", message: "String should have at least 1 character" }])).toBe("Title: Use at least 1 characters.");
    expect(validationMessage([{ message: "Value error, bad" }])).toBe("bad");
  });
});

describe("L-04 styled form validation", () => {
  it("sign-up", () => {
    expect(validateSignUp({ name: "", email: "x", password: "short" })).toEqual({ name: "Enter your name.", email: "Enter a valid email address, like you@domain.com.", password: "Use at least 8 characters." });
    expect(validateSignUp({ name: "Ada", email: "ada@example.com", password: "long-enough" })).toEqual({});
  });
  it("sign-in", () => {
    expect(validateSignIn({ email: "", password: "" })).toEqual({ email: "Enter your email address.", password: "Enter your password." });
  });
});

describe("M-11 security headers", () => {
  const csp = contentSecurityPolicy({ apiUrl: "https://api.pramaan.example/v1", firebaseAuthDomain: "pramaan.firebaseapp.com" });
  it("blocks framing and plugins, allows only the needed origins", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https://api.pramaan.example");
    expect(csp).toContain("https://pramaan.firebaseapp.com");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("localhost:9099");
  });
  it("dev and emulator additions only when asked", () => {
    const dev = contentSecurityPolicy({ dev: true, useEmulator: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("http://127.0.0.1:9099");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
  it("sends the standard hardening headers", () => {
    const keys = Object.fromEntries(securityHeaders({}).map((h) => [h.key, h.value]));
    expect(keys["X-Frame-Options"]).toBe("DENY");
    expect(keys["X-Content-Type-Options"]).toBe("nosniff");
    expect(keys["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(keys["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
  });
});

describe("Research with this", () => {
  it("builds from the document and stays in its project", async () => {
    const { researchWithDocumentHref } = await import("@/lib/utils/library");
    const doc = { id: "d1", title: "Getting Started", projectIds: ["p1"] };
    const url = new URL(researchWithDocumentHref(doc), "https://x");
    expect(url.pathname).toBe("/research/new");
    expect(url.searchParams.get("doc")).toBe("d1");
    expect(url.searchParams.get("project")).toBe("p1"); // its only project
    expect(url.searchParams.get("q")).toContain("Getting Started");
    expect(new URL(researchWithDocumentHref({ ...doc, projectIds: ["p1", "p2"] }), "https://x").searchParams.get("project")).toBeNull(); // ambiguous: ask
    expect(new URL(researchWithDocumentHref({ ...doc, projectIds: ["p1", "p2"] }, "p2"), "https://x").searchParams.get("project")).toBe("p2"); // the one being browsed
  });
});
