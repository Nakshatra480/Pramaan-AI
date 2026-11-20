/** Preference validation and merging (pure; unit-tested in tests/preferences.test.ts). */
import type { UserPreferences } from "@/types";

/** Preferences stored on the profile and shared across devices. Theme and motion stay per device. */
export const SYNCED_KEYS = ["interests", "defaultMode", "defaultChannels", "citationStyle", "responseLength", "notifications", "retentionDays"] as const satisfies readonly (keyof UserPreferences)[];

const MODES = ["quick", "standard", "deep"];
const CHANNELS = ["web", "academic", "library", "project"];
const STYLES = ["numeric", "apa", "mla", "chicago"];
const LENGTHS = ["concise", "balanced", "comprehensive"];
const THEMES = ["light", "dark", "system"];
const RETENTION = [0, 30, 90, 365];

/** The value if it's valid for `key`, otherwise undefined (so bad or stale stored data never breaks the UI). */
function valid<K extends keyof UserPreferences>(key: K, v: unknown, base: UserPreferences): UserPreferences[K] | undefined {
  const ok = (() => {
    switch (key) {
      case "interests":
        return Array.isArray(v) && v.every((x) => typeof x === "string");
      case "defaultMode":
        return MODES.includes(v as string);
      case "defaultChannels":
        return Array.isArray(v) && v.length > 0 && v.every((x) => CHANNELS.includes(x as string));
      case "citationStyle":
        return STYLES.includes(v as string);
      case "responseLength":
        return LENGTHS.includes(v as string);
      case "theme":
        return THEMES.includes(v as string);
      case "reducedMotion":
        return typeof v === "boolean";
      case "retentionDays":
        return RETENTION.includes(v as number);
      case "notifications":
        return typeof v === "object" && v !== null;
      default:
        return false;
    }
  })();
  if (!ok) return undefined;
  if (key === "notifications") {
    const n = v as Record<string, unknown>;
    const d = base.notifications;
    return {
      researchComplete: typeof n.researchComplete === "boolean" ? n.researchComplete : d.researchComplete,
      documentIndexed: typeof n.documentIndexed === "boolean" ? n.documentIndexed : d.documentIndexed,
    } as UserPreferences[K];
  }
  return v as UserPreferences[K];
}

/** `base` overlaid with every valid value of `keys` from `stored`; unknown keys and invalid values are ignored. */
export function mergeStoredPreferences(base: UserPreferences, stored: unknown, keys: readonly (keyof UserPreferences)[] = SYNCED_KEYS): UserPreferences {
  if (!stored || typeof stored !== "object") return base;
  const src = stored as Record<string, unknown>;
  const next = { ...base };
  for (const k of keys) {
    if (!(k in src)) continue;
    const v = valid(k, src[k], base);
    if (v !== undefined) (next as Record<string, unknown>)[k] = v;
  }
  return next;
}
