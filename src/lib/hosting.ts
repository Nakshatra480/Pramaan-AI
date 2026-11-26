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

export interface HeaderRule {
  key: string;
  value: string;
}

/**
 * The Caddy config for self-hosting (deploy/vultr): the same client routes, 404s and security headers as
 * vercel.json, plus the API behind the same origin. Generated, never hand-edited: `npm run caddyfile`.
 */
export function caddyfile(rewrites: Rewrite[], securityHeaders: HeaderRule[]): string {
  const q = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const routes = rewrites.map((r) => sourcePattern(r.source).source.replace(/^\^|\$$/g, "")).join("|");
  const headers = securityHeaders.map((h) => `\t\t${h.key} ${q(h.value)}`).join("\n");
  return `# Generated from vercel.json by \`npm run caddyfile\` (src/lib/hosting.ts). Do not edit by hand.
# Serves the built web app from /srv/www and proxies the API (same origin) to the api container.
{$SITE_ADDRESS} {
\tencode zstd gzip

\theader {
${headers}
\t\tStrict-Transport-Security "max-age=31536000"
\t\t-Server
\t}

\t# API: REST, the research progress stream (SSE, unbuffered) and health checks.
\t@api path /api/* /health /health/* /ready
\thandle @api {
\t\treverse_proxy api:8000 {
\t\t\tflush_interval -1
\t\t}
\t}

\t# Web app: client routes get index.html; anything that isn't a file is a real 404.
\t@app path_regexp app \`^(?:${routes})$\`
\thandle {
\t\troot * /srv/www
\t\troute {
\t\t\theader /assets/* Cache-Control "public, max-age=31536000, immutable"
\t\t\trewrite @app /index.html
\t\t\theader /index.html Cache-Control "no-cache"
\t\t\tfile_server
\t\t}
\t}

\thandle_errors {
\t\t@notFound expression {err.status_code} == 404
\t\thandle @notFound {
\t\t\troot * /srv/www
\t\t\trewrite * /404.html
\t\t\theader Cache-Control "no-cache"
\t\t\tfile_server
\t\t}
\t\thandle {
\t\t\trespond "{err.status_code} {err.status_text}" {err.status_code}
\t\t}
\t}
}
`;
}
