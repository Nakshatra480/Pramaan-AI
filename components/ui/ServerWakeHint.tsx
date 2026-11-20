"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { backendState, prewarmBackend } from "@/lib/api/warmup";

/** Starts waking the API when mounted (see lib/api/warmup.ts). Renders nothing. */
export function BackendPrewarm() {
  useEffect(() => void prewarmBackend(), []);
  return null;
}

/**
 * While `active` (e.g. signing in), explains a long wait instead of a silent spinner: shown when the
 * server is known to be waking, or after `delayMs` of waiting.
 */
export function ServerWakeHint({ active, delayMs = 4000, className }: { active: boolean; delayMs?: number; className?: string }) {
  const state = useSyncExternalStore(backendState.subscribe, backendState.get, () => "idle" as const);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setLate(true), delayMs);
    return () => {
      clearTimeout(t);
      setLate(false);
    };
  }, [active, delayMs]);
  if (!active || !(late || state === "waking")) return null;
  return (
    <p role="status" aria-live="polite" className={className ?? "text-[12.5px] leading-snug text-ink-muted"}>
      Starting Pramaan&rsquo;s server — after a quiet period this can take up to a minute. You&rsquo;ll be signed in automatically.
    </p>
  );
}
