import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverFallback = false) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => serverFallback,
  );
}

export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)", true);
export const useIsMobile = () => useMediaQuery("(max-width: 767px)", false);
