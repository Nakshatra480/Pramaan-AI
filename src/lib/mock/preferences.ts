import { mergeStoredPreferences } from "@/lib/utils/preferences";
import type { UserPreferences } from "@/types";

const KEY = "pramaan.prefs.v1";

export const DEFAULT_PREFERENCES: UserPreferences = {
  interests: [],
  defaultMode: "standard",
  defaultChannels: ["web", "academic"],
  citationStyle: "numeric",
  responseLength: "balanced",
  theme: "light",
  reducedMotion: false,
  notifications: { researchComplete: true, documentIndexed: true },
  retentionDays: 0,
};

export const preferencesService = {
  read(): UserPreferences {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
      return raw ? mergeStoredPreferences(DEFAULT_PREFERENCES, JSON.parse(raw), Object.keys(DEFAULT_PREFERENCES) as (keyof UserPreferences)[]) : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  },
  write(prefs: UserPreferences) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
  },
};
