import { SOURCES } from "@/data/sources";
import type { Source } from "@/types";
import { latency } from "./db";

const byId = new Map(SOURCES.map((s) => [s.id, s]));

export const sourceService = {
  /** Synchronous lookup — sources arrive embedded in research responses in production. */
  getSync(id: string): Source | undefined {
    return byId.get(id);
  },
  async getMany(ids: string[]): Promise<Source[]> {
    await latency(120);
    return ids.map((id) => byId.get(id)).filter((s): s is Source => Boolean(s));
  },
  all(): Source[] {
    return SOURCES;
  },
};
