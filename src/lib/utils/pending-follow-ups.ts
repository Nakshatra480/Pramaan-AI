/**
 * Follow-ups the user just asked, shown instantly (optimistic) while the request is sent and the
 * research reloads. Each is replaced by the server's copy once it appears in `research.followUps`.
 */
export interface PendingFollowUp {
  key: string;
  researchId: string;
  question: string;
  createdAt: string;
  /** Set when the server has accepted it; the pending copy is dropped once that id is loaded. */
  serverId?: string;
}

let items: PendingFollowUp[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let seq = 0;

export const pendingFollowUps = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  snapshot: (): PendingFollowUp[] => items,
  add(researchId: string, question: string): string {
    const key = `pending-${Date.now()}-${++seq}`;
    items = [...items, { key, researchId, question, createdAt: new Date().toISOString() }];
    emit();
    return key;
  },
  accept(key: string, serverId: string) {
    items = items.map((p) => (p.key === key ? { ...p, serverId } : p));
    emit();
  },
  remove(key: string) {
    items = items.filter((p) => p.key !== key);
    emit();
  },
  /** Drop pending copies whose server version has loaded. */
  settle(loadedIds: string[]) {
    const next = items.filter((p) => !p.serverId || !loadedIds.includes(p.serverId));
    if (next.length !== items.length) {
      items = next;
      emit();
    }
  },
};

/** Pending follow-ups for one research that the loaded research doesn't contain yet. */
export function visiblePending(all: PendingFollowUp[], researchId: string, loadedIds: string[]): PendingFollowUp[] {
  return all.filter((p) => p.researchId === researchId && (!p.serverId || !loadedIds.includes(p.serverId)));
}
