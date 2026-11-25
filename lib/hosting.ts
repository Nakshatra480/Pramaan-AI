/**
 * Static hosting rules shared by vercel.json and the local preview server (vite.config.ts): client routes
 * are rewritten to index.html, everything else that isn't a file gets 404.html with a real 404 status.
 */
export interface Rewrite {
  source: string;
  destination: string;
}

/** A Vercel `source` pattern ("/research/:path*", "/shared/:id") as a RegExp over the URL path. */
export function sourcePattern(source: string): RegExp {
  const body = source
    .split("/")
    .filter(Boolean)
    .map((seg) => (/^:\w+\*$/.test(seg) ? "(?:/.*)?" : /^:\w+$/.test(seg) ? "/[^/]+" : "/" + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return body ? new RegExp(`^${body}/?$`) : /^\/$/;
}

/** The rewrite that serves `path`, if any. */
export function matchRewrite(rewrites: Rewrite[], path: string): Rewrite | undefined {
  return rewrites.find((r) => sourcePattern(r.source).test(path));
}
