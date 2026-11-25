import { AnimatePresence, motion } from "framer-motion";
import { Check, Ear, Pause, Play, Settings2, SkipBack, SkipForward, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, type MenuEntry } from "@/components/ui/Menu";
import { Portal } from "@/components/ui/Portal";
import { buildNarration, estimateMinutes } from "@/lib/speech/narration";
import { narrator, RATES, speechSupported, useNarration, useVoices } from "@/lib/speech/narrator";
import { cn } from "@/lib/utils/cn";
import { useResearch } from "./ResearchContext";

/**
 * "Listen" — reads the report aloud with the browser's speech synthesis. Sits with Share / Export /
 * Research again; once started, a player docks at the bottom of the screen.
 */
export function ListenButton() {
  const { research } = useResearch();
  const n = useNarration();
  const chunks = useMemo(() => buildNarration(research), [research]);
  const mine = n.key === research.id && n.status !== "idle";

  // Leaving the report stops its narration.
  useEffect(() => () => narrator.stopIf(research.id), [research.id]);

  if (!speechSupported() || !chunks.length) return null;

  const onClick = () => (mine ? narrator.toggle() : narrator.play(research.id, chunks));
  const label = !mine ? "Listen" : n.status === "playing" ? "Pause" : "Resume";
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={onClick}
        aria-label={!mine ? `Listen to this report (about ${estimateMinutes(chunks, n.rate)} min)` : label}
        title={!mine ? `Listen to this report · about ${estimateMinutes(chunks, n.rate)} min` : undefined}
        leading={!mine ? <Ear className="size-4" /> : n.status === "playing" ? <Pause className="size-4" /> : <Play className="size-4" />}
        className={cn(mine && "border-sage-ink/30 bg-sage-soft text-sage-ink hover:bg-sage-soft")}
      >
        {label}
      </Button>
      {mine && <NarrationPlayer />}
    </>
  );
}

/** Narration status for a report section: "playing" / "paused" while it's the section being read, else null. */
export function useNarratingSection(researchId: string, sectionId: string): "playing" | "paused" | null {
  const n = useNarration();
  return n.key === researchId && n.status !== "idle" && n.chunks[n.index]?.sectionId === sectionId ? n.status : null;
}

/** Small animated "now reading" bars shown beside the section heading being read. */
export function ReadingIndicator({ paused }: { paused?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle ml-3 h-6 px-2 rounded-full bg-sage-soft text-sage-ink text-[11.5px] font-medium font-sans tracking-normal" data-print-hide>
      <span className="flex items-end gap-[2px] h-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-[2px] rounded-full bg-current"
            animate={paused ? { height: 4 } : { height: [4, 12, 6, 10, 4] }}
            transition={paused ? { duration: 0.2 } : { duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
          />
        ))}
      </span>
      {paused ? "Paused" : "Reading"}
    </span>
  );
}

function NarrationPlayer() {
  const n = useNarration();
  const voices = useVoices();
  const chunk = n.chunks[n.index];
  const progress = n.chunks.length ? (n.index + 1) / n.chunks.length : 0;
  const playing = n.status === "playing";

  const settings: MenuEntry[] = [
    { heading: "Speed" },
    ...RATES.map((r) => ({ label: `${r}×`, icon: r === n.rate ? <Check /> : <span className="block size-4" />, onSelect: () => narrator.setRate(r) })),
    ...(voices.length > 1
      ? (["separator", { heading: "Voice" }, ...voices.slice(0, 8).map((v, i) => ({
          label: v.name.replace(/^(Microsoft|Google)\s+/, ""),
          description: v.lang,
          icon: (n.voiceURI ? v.voiceURI === n.voiceURI : i === 0) ? <Check /> : <span className="block size-4" />,
          onSelect: () => narrator.setVoice(v.voiceURI),
        }))] as MenuEntry[])
      : []),
  ];

  const jumpTo = () => {
    if (!chunk) return;
    const el = document.getElementById(chunk.sectionId === "top" ? "main" : chunk.sectionId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Portal>
      <AnimatePresence>
        <motion.div
          role="region"
          aria-label="Report narration"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="print:hidden fixed z-[var(--z-popover)] left-1/2 -translate-x-1/2 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-6 w-[min(560px,calc(100vw-2rem))] rounded-2xl border border-line bg-raised/95 backdrop-blur-md shadow-lg"
        >
          <div className="flex items-center gap-2 p-2 pl-3">
            <span className="grid place-items-center size-8 shrink-0 rounded-full bg-sage-soft text-sage-ink" aria-hidden>
              <Ear className="size-4" />
            </span>
            <button type="button" onClick={jumpTo} className="min-w-0 flex-1 text-left rounded-md px-1 py-0.5 hover:bg-subtle" title="Go to this section">
              <span className="block text-[13px] font-medium text-ink truncate">{chunk?.sectionLabel ?? "Report"}</span>
              <span className="block text-[11.5px] text-ink-muted tabular truncate" aria-live="off">
                {n.error ?? `${playing ? "Reading aloud" : "Paused"} · ${n.index + 1} of ${n.chunks.length} · ${n.rate}×`}
              </span>
            </button>
            <IconButton label="Previous section" size="md" variant="ghost" onClick={() => narrator.previousSection()}>
              <SkipBack className="size-4" />
            </IconButton>
            <button
              type="button"
              onClick={() => narrator.toggle()}
              aria-label={playing ? "Pause narration" : "Resume narration"}
              className="grid place-items-center size-10 shrink-0 rounded-full bg-ink text-bg hover:bg-ink-2 transition-[background-color,transform] active:scale-95"
            >
              {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current translate-x-[1px]" />}
            </button>
            <IconButton label="Next section" size="md" variant="ghost" onClick={() => narrator.nextSection()}>
              <SkipForward className="size-4" />
            </IconButton>
            <Menu
              label="Playback settings"
              placement="top-end"
              className="w-[240px] max-h-[60vh] overflow-y-auto thin-scrollbar"
              items={settings}
              trigger={
                <IconButton label="Playback settings" size="md" variant="ghost" className="hidden xs:inline-grid">
                  <Settings2 className="size-4" />
                </IconButton>
              }
            />
            <IconButton label="Stop narration" size="md" variant="ghost" onClick={() => narrator.stop()}>
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="h-[3px] mx-3 mb-2 rounded-full bg-subtle overflow-hidden" aria-hidden>
            <motion.div className="h-full bg-sage-ink/70 rounded-full" animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.4 }} />
          </div>
        </motion.div>
      </AnimatePresence>
    </Portal>
  );
}
