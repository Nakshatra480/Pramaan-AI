import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RouteObject } from "react-router";
import { routes } from "@/router";
import { matchRewrite, sourcePattern } from "@/lib/hosting";
import { contentSecurityPolicy, staticHeaders } from "@/lib/security/headers";

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
  framework: string;
  outputDirectory: string;
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

describe("static hosting config", () => {
  it("serves exactly the static security headers on every path", () => {
    expect(vercel.headers.find((h) => h.source === "/(.*)")?.headers).toEqual(staticHeaders());
  });
  it("builds with Vite into dist", () => {
    expect(vercel.framework).toBe("vite");
    expect(vercel.outputDirectory).toBe("dist");
    expect(vercel.rewrites.every((r) => r.destination === "/index.html")).toBe(true);
  });
  it("allows the microphone for this origin only (voice input)", () => {
    const pp = staticHeaders().find((h) => h.key === "Permissions-Policy")!.value;
    expect(pp).toContain("microphone=(self)");
    expect(pp).toContain("camera=()");
  });
  it("blocks framing from the header, since a <meta> policy can't", () => {
    expect(staticHeaders().find((h) => h.key === "Content-Security-Policy")!.value).toContain("frame-ancestors 'none'");
  });
});

describe("meta content security policy", () => {
  it("allows only hashed inline scripts in production", () => {
    const csp = contentSecurityPolicy({ meta: true, scriptHashes: ["sha256-abc="] });
    expect(csp).toMatch(/script-src 'self' 'sha256-abc='/);
    expect(csp).not.toContain("'unsafe-inline' https://apis.google.com");
    expect(csp).not.toContain("frame-ancestors");
  });
  it("lets the dev server's HMR preamble run", () => {
    expect(contentSecurityPolicy({ meta: true, dev: true })).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });
});

/** Every concrete URL shape the client router serves, with params filled in. */
function routePaths(list: RouteObject[], base = ""): string[] {
  return list.flatMap((r) => {
    const here = r.path === "*" ? null : r.path ? `${base.replace(/\/$/, "")}/${r.path}`.replace(/:\w+/g, "x") : base || "/";
    if (here === null) return [];
    return [...(r.index || r.path ? [here] : []), ...routePaths(r.children ?? [], here)];
  });
}

describe("client routes and real 404s", () => {
  const paths = [...new Set(routePaths(routes))];
  it("finds the app's routes", () => {
    expect(paths).toEqual(expect.arrayContaining(["/", "/research/new", "/research/x", "/projects/x/settings", "/settings/billing", "/shared/x", "/auth/login"]));
  });
  it("rewrites every client route to the app", () => {
    for (const p of paths) expect(matchRewrite(vercel.rewrites, p), p).toBeDefined();
  });
  it("leaves unknown paths and missing assets to the 404 page", () => {
    for (const p of ["/about", "/blog/post", "/assets/missing.js", "/researchx", "/shared"]) expect(matchRewrite(vercel.rewrites, p), p).toBeUndefined();
  });
  it("converts Vercel source patterns", () => {
    expect(sourcePattern("/research/:path*").test("/research")).toBe(true);
    expect(sourcePattern("/research/:path*").test("/research/a/b")).toBe(true);
    expect(sourcePattern("/shared/:id").test("/shared/a/b")).toBe(false);
    expect(sourcePattern("/").test("/")).toBe(true);
    expect(sourcePattern("/").test("/x")).toBe(false);
  });
});
