import { COLLECTIONS, DOCUMENTS } from "@/data/library";
import { ACTIVITY, PROJECTS } from "@/data/projects";
import { RESEARCH } from "@/data/research";
import type { ActivityItem, Collection, LibraryDocument, Project, Research } from "@/types";

/**
 * In-browser mock database. Stands in for Neon PostgreSQL during the UI phase.
 * State persists to localStorage so created projects, research and uploads
 * survive reloads. Nothing here is imported by UI components directly —
 * they go through `lib/services`.
 */

export interface DbState {
  research: Research[];
  projects: Project[];
  documents: LibraryDocument[];
  collections: Collection[];
  activity: ActivityItem[];
}

const STORAGE_KEY = "pramaan.db.v1";

function seed(): DbState {
  return structuredClone({
    research: RESEARCH,
    projects: PROJECTS,
    documents: DOCUMENTS,
    collections: COLLECTIONS,
    activity: ACTIVITY,
  });
}

let state: DbState | null = null;
const listeners = new Set<() => void>();

function load(): DbState {
  if (state) return state;
  state = seed();
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) state = { ...state, ...(JSON.parse(raw) as Partial<DbState>) };
    } catch {
      // Storage unavailable (private mode, blocked) — fall back to seed data.
    }
  }
  return state;
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  if (typeof window === "undefined") return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota / availability errors.
    }
  }, 120);
}

export const db = {
  read(): DbState {
    return load();
  },
  write(mutator: (draft: DbState) => void) {
    const next = structuredClone(load());
    mutator(next);
    state = next;
    persist();
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  reset() {
    state = seed();
    persist();
    listeners.forEach((l) => l());
  },
};

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Simulated network latency with a little jitter. */
export function latency(ms = 280) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms + Math.random() * ms * 0.4));
}
