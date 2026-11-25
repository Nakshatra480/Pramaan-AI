import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { services } from "@/lib/services";

/**
 * Minimal data-fetching hook. Loads via a service call and silently refetches
 * when the data layer changes — analogous to query invalidation with SWR /
 * TanStack Query once a real API exists. `peek` returns cached data to render
 * immediately while the fetch revalidates it.
 */
export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[], peek?: () => T | undefined) {
  const [data, setData] = useState<T | undefined>(() => peek?.());
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Initial load resets to a loading state when dependencies change. With `peek`, data already in hand
    // (e.g. a report opened earlier) shows at once and the fetch refreshes it in the background.
    if (peek) {
      const cached = peek();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(cached);
    }
    setLoading(true);
    fetcherRef
      .current()
      .then((r) => {
        if (active) {
          setData(r);
          setError(null);
        }
      })
      .catch((e) => active && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => active && setLoading(false));
    const unsub = services.subscribe(() => {
      if (active) void load(true);
    });
    return () => {
      active = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading: loading && data === undefined, refresh: () => load(false) };
}
