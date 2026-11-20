"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { services } from "@/lib/services";
import type { Research, Source } from "@/types";

interface ResearchContextValue {
  research: Research;
  /** Cited sources in citation order. */
  sources: Source[];
  sourceByIndex: (index: number) => Source | undefined;
  indexOf: (sourceId: string) => number;
  activeSourceId: string | null;
  openSource: (sourceId: string) => void;
  closeSource: () => void;
  readOnly: boolean;
}

const Ctx = createContext<ResearchContextValue | null>(null);

export function ResearchProvider({ research, children, initialSourceId = null, readOnly = false }: { research: Research; children: ReactNode; initialSourceId?: string | null; readOnly?: boolean }) {
  const [activeSourceId, setActive] = useState<string | null>(initialSourceId);
  const sources = useMemo(
    () =>
      research.sources ??
      research.sourceIds.map((id) => services.sources.getSync(id)).filter((s): s is Source => Boolean(s)),
    [research.sources, research.sourceIds],
  );
  const sourceByIndex = useCallback((i: number) => sources[i - 1], [sources]);
  const indexOf = useCallback((id: string) => research.sourceIds.indexOf(id) + 1, [research.sourceIds]);
  const openSource = useCallback((id: string) => setActive(id), []);
  const closeSource = useCallback(() => setActive(null), []);

  const value = useMemo(
    () => ({ research, sources, sourceByIndex, indexOf, activeSourceId, openSource, closeSource, readOnly }),
    [research, sources, sourceByIndex, indexOf, activeSourceId, openSource, closeSource, readOnly],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResearch() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useResearch must be used within ResearchProvider");
  return ctx;
}
