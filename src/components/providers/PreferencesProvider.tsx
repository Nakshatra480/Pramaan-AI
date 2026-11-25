import { MotionConfig } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_PREFERENCES } from "@/lib/mock/preferences";
import { services } from "@/lib/services";
import { mergeStoredPreferences, SYNCED_KEYS } from "@/lib/utils/preferences";
import type { UserPreferences } from "@/types";

interface PreferencesContextValue {
  prefs: UserPreferences;
  /** Applies locally at once; synced keys are also saved to the profile. Resolves when the save is done (rejects if it failed). */
  update: (patch: Partial<UserPreferences>) => Promise<void>;
  ready: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Hydrate from this device after mount (keeps SSR markup deterministic)…
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(services.preferences.read());
    setReady(true);
    // …then from the profile once signed in: research defaults, notifications and retention follow the
    // account across devices (audit M-02). Appearance (theme, motion) stays per device.
    return services.auth.onAuthStateChanged((user) => {
      const stored = user ? services.auth.storedPreferences() : null;
      if (!stored) return;
      setPrefs((prev) => {
        const next = mergeStoredPreferences(prev, stored);
        services.preferences.write(next);
        return next;
      });
    });
  }, []);

  // Theme + reduced-motion attributes on <html>.
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = prefs.theme === "dark" || (prefs.theme === "system" && media.matches);
      root.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    root.dataset.reducedMotion = String(prefs.reducedMotion);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs.theme, prefs.reducedMotion]);

  const update = useCallback(async (patch: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      services.preferences.write(next);
      return next;
    });
    const synced = Object.fromEntries(SYNCED_KEYS.filter((k) => patch[k] !== undefined).map((k) => [k, patch[k]]));
    if (Object.keys(synced).length && services.auth.currentUser()) await services.auth.savePreferences(synced);
  }, []);

  const value = useMemo(() => ({ prefs, update, ready }), [prefs, update, ready]);

  return (
    <PreferencesContext.Provider value={value}>
      <MotionConfig reducedMotion={prefs.reducedMotion ? "always" : "user"}>{children}</MotionConfig>
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
