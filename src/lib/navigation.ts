import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";

export interface AppRouter {
  /** Resolves once the new page has rendered. */
  push(href: string): Promise<void>;
  replace(href: string): Promise<void>;
  back(): void;
}

/** Imperative navigation for components: `router.push("/research/new")`. Stable across renders. */
export function useRouter(): AppRouter {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: async (href: string) => navigate(href),
      // "Leave, then delete" flows await this so the old page has unmounted (flushSync commits it
      // synchronously) before the delete's change event, or it would refetch what it just deleted (audit L-13).
      replace: async (href: string) => navigate(href, { replace: true, flushSync: true }),
      back: () => void navigate(-1),
    }),
    [navigate],
  );
}

/** The current path, without query string or hash. */
export function usePathname(): string {
  return useLocation().pathname;
}

export const APP_NAME = "Pramaan AI";
export const DEFAULT_TITLE = "Pramaan AI — Research, with evidence.";

/** Sets the document title for a page: "Library · Pramaan AI" (or the default title when omitted). */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : DEFAULT_TITLE;
  }, [title]);
}
