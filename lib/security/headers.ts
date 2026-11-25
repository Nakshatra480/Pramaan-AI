/**
 * Security headers for every page (audit M-11).
 *
 * The app is a static single-page build, so the policy is split in two:
 * - the Content-Security-Policy is injected into index.html as a <meta> tag at build time (vite.config.ts),
 *   because its origins come from the build environment: the Pramaan API, Firebase Auth / App Check / Analytics;
 * - the fixed headers below (including `frame-ancestors`, which a <meta> policy cannot set) are served by the
 *   host from vercel.json. tests/security-headers.test.ts keeps vercel.json in sync with `staticHeaders()`.
 */
export interface HeaderEnv {
  apiUrl?: string;
  firebaseAuthDomain?: string;
  useEmulator?: boolean;
  dev?: boolean;
  /** 'sha256-…' sources for the inline scripts in index.html (production builds allow only these). */
  scriptHashes?: string[];
  /** Omit directives a <meta> policy ignores (frame-ancestors). */
  meta?: boolean;
}

function origin(url?: string): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(env: HeaderEnv): string {
  const api = origin(env.apiUrl);
  const authDomain = env.firebaseAuthDomain ? `https://${env.firebaseAuthDomain.replace(/^https?:\/\//, "")}` : null;
  const emulator = env.useEmulator ? ["http://127.0.0.1:9099", "http://localhost:9099"] : [];
  const google = ["https://apis.google.com", "https://www.google.com", "https://www.gstatic.com", "https://www.googletagmanager.com"];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Production allows only hashed inline scripts (the theme bootstrap); the dev server's HMR preamble needs inline + eval.
    "script-src": ["'self'", ...(env.dev ? ["'unsafe-inline'", "'unsafe-eval'"] : (env.scriptHashes ?? []).map((h) => `'${h}'`)), ...google],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"], // avatars from sign-in providers
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ...(api ? [api] : []),
      "https://*.googleapis.com",
      "https://www.google.com",
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://www.googletagmanager.com",
      ...emulator,
      ...(env.dev ? ["ws:", "wss:"] : []),
    ],
    "frame-src": ["'self'", ...(authDomain ? [authDomain] : []), "https://*.firebaseapp.com", "https://www.google.com", "https://recaptcha.google.com"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    ...(env.meta ? {} : { "frame-ancestors": ["'none'"] }),
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${[...new Set(v)].join(" ")}`);
  if (!env.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export interface Header {
  key: string;
  value: string;
}

/** Headers that don't depend on the environment; served for every path (see vercel.json). */
export function staticHeaders(): Header[] {
  return [
    // The rest of the policy is in the page's <meta> tag; browsers enforce both.
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // The microphone is used by voice input in the research composer (this origin only).
    { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
    // Google sign-in uses a popup that must be able to report back to this window.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}

/** Every header a page gets, with the full policy as a single header (for hosts that can set per-environment headers). */
export function securityHeaders(env: HeaderEnv): Header[] {
  return [{ key: "Content-Security-Policy", value: contentSecurityPolicy(env) }, ...staticHeaders().filter((h) => h.key !== "Content-Security-Policy")];
}
