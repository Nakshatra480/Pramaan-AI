/**
 * A same-origin path to return to after sign-in, or the fallback. Rejects absolute URLs,
 * protocol-relative "//host" and "/\\host" (which browsers also treat as another origin),
 * and the auth pages themselves (no redirect loops).
 */
export function safeNext(raw: string | null | undefined, fallback = "/app"): string {
  if (!raw || raw.length > 2048) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex -- reject control characters in redirect targets
  if (/[\u0000-\u001f\\]/.test(raw)) return fallback;
  if (raw === "/auth" || raw.startsWith("/auth/")) return fallback;
  return raw;
}
