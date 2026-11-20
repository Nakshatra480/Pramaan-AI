/**
 * Security headers for every page (audit M-11). No nonces, so pages stay statically renderable
 * (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Without Nonces").
 * Origins are derived from the configured environment: the Pramaan API, Firebase Auth / App Check / Analytics.
 */
export interface HeaderEnv {
  apiUrl?: string;
  firebaseAuthDomain?: string;
  useEmulator?: boolean;
  dev?: boolean;
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
    // Next.js inline bootstrap scripts need 'unsafe-inline' without nonces; dev tooling needs eval.
    "script-src": ["'self'", "'unsafe-inline'", ...(env.dev ? ["'unsafe-eval'"] : []), ...google],
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
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${[...new Set(v)].join(" ")}`);
  if (!env.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(env: HeaderEnv): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(env) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    // Google sign-in uses a popup that must be able to report back to this window.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}
