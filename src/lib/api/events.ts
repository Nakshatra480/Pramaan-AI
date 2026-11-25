/** Change feed for API mode: mutations and polls notify subscribers so `useResource` refetches. */
const listeners = new Set<() => void>();

export const apiEvents = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  notify() {
    listeners.forEach((l) => l());
  },
};

let pollTimer: ReturnType<typeof setTimeout> | undefined;
/** Coalesced refresh — used while backend work (indexing, follow-ups) is in progress. */
export function scheduleRefresh(ms = 1500) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => apiEvents.notify(), ms);
}
