/**
 * Report narration with the browser's built-in speech synthesis (Web Speech API). One narrator for the
 * whole app — the browser has a single speech queue — exposed as a small external store for React.
 *
 * Chunks are spoken one utterance at a time. Pause cancels the current utterance and remembers where it
 * was (native pause/resume is unreliable across browsers), so resume restarts that sentence.
 */
import { useSyncExternalStore } from "react";
import { sectionStart, type NarrationChunk } from "./narration";

export type NarrationStatus = "idle" | "playing" | "paused";

export interface NarrationState {
  status: NarrationStatus;
  /** Which research is loaded (so a report page only shows its own player). */
  key: string | null;
  chunks: NarrationChunk[];
  index: number;
  rate: number;
  voiceURI: string | null;
  error: string | null;
}

export const RATES = [0.75, 1, 1.25, 1.5, 2] as const;
const PREFS_KEY = "pramaan.narration.v1";

function loadPrefs(): { rate: number; voiceURI: string | null } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { rate?: number; voiceURI?: string };
    return { rate: RATES.includes(p.rate as (typeof RATES)[number]) ? p.rate! : 1, voiceURI: typeof p.voiceURI === "string" ? p.voiceURI : null };
  } catch {
    return { rate: 1, voiceURI: null };
  }
}

function savePrefs(rate: number, voiceURI: string | null) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ rate, voiceURI }));
  } catch {
    /* storage unavailable */
  }
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

/** Voices for the page language (English by default), best-sounding first. */
export function availableVoices(lang = typeof navigator !== "undefined" ? navigator.language : "en-US"): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  const base = lang.split("-")[0].toLowerCase();
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(base));
  const pool = voices.length ? voices : window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|premium|enhanced|online/i.test(v.name) ? 4 : 0) + (/google|samantha|daniel|karen|aria|jenny|guy/i.test(v.name) ? 2 : 0) + (v.lang.toLowerCase() === lang.toLowerCase() ? 1 : 0) + (v.localService ? 0 : 0.5);
  return [...pool].sort((a, b) => score(b) - score(a));
}

let state: NarrationState = { status: "idle", key: null, chunks: [], index: 0, error: null, ...(typeof window !== "undefined" ? loadPrefs() : { rate: 1, voiceURI: null }) };
const listeners = new Set<() => void>();
let generation = 0; // bumps on every (re)start so callbacks from cancelled utterances are ignored

function set(patch: Partial<NarrationState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = availableVoices();
  return voices.find((v) => v.voiceURI === state.voiceURI) ?? voices[0] ?? null;
}

function speakFrom(index: number) {
  const synth = window.speechSynthesis;
  const gen = ++generation;
  synth.cancel();
  if (index >= state.chunks.length) {
    set({ status: "idle", index: 0 });
    return;
  }
  set({ status: "playing", index, error: null });
  const u = new SpeechSynthesisUtterance(state.chunks[index].text);
  const voice = pickVoice();
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = state.rate;
  u.onend = () => {
    if (gen === generation && state.status === "playing") speakFrom(index + 1);
  };
  u.onerror = (e) => {
    if (gen !== generation || e.error === "interrupted" || e.error === "canceled") return;
    set({ status: "paused", error: e.error === "not-allowed" ? "Your browser blocked audio playback. Press play to start." : "Narration stopped unexpectedly. Press play to continue." });
  };
  // Some engines drop an utterance queued in the same tick as cancel().
  setTimeout(() => {
    if (gen === generation) synth.speak(u);
  }, 30);
}

export const narrator = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => state,

  /** Starts (or restarts) narrating `chunks` for `key`. */
  play(key: string, chunks: NarrationChunk[], from = 0) {
    if (!speechSupported() || !chunks.length) return;
    set({ key, chunks });
    speakFrom(Math.min(Math.max(0, from), chunks.length - 1));
  },
  pause() {
    if (state.status !== "playing") return;
    generation++;
    window.speechSynthesis.cancel();
    set({ status: "paused" });
  },
  resume() {
    if (state.status === "paused") speakFrom(state.index);
  },
  toggle() {
    if (state.status === "playing") narrator.pause();
    else narrator.resume();
  },
  stop() {
    if (state.status === "idle" && !state.key) return;
    generation++;
    if (speechSupported()) window.speechSynthesis.cancel();
    set({ status: "idle", key: null, chunks: [], index: 0, error: null });
  },
  /** Stops only if `key` is what's being narrated (a page leaving shouldn't stop another page's narration). */
  stopIf(key: string) {
    if (state.key === key) narrator.stop();
  },
  nextSection() {
    jump(sectionStart(state.chunks, state.index, 1));
  },
  previousSection() {
    jump(sectionStart(state.chunks, state.index, -1));
  },
  setRate(rate: number) {
    set({ rate });
    savePrefs(rate, state.voiceURI);
    if (state.status === "playing") speakFrom(state.index);
  },
  setVoice(voiceURI: string) {
    set({ voiceURI });
    savePrefs(state.rate, voiceURI);
    if (state.status === "playing") speakFrom(state.index);
  },
};

function jump(index: number) {
  if (!state.chunks.length) return;
  if (index >= state.chunks.length) return narrator.stop();
  if (state.status === "playing") speakFrom(index);
  else set({ index, status: "paused" });
}

export function useNarration(): NarrationState {
  return useSyncExternalStore(narrator.subscribe, narrator.snapshot, narrator.snapshot);
}

/** Re-renders when the browser finishes loading its voice list (it loads asynchronously in Chrome). */
export function useVoices(): SpeechSynthesisVoice[] {
  const version = useSyncExternalStore(subscribeVoices, voicesVersion, () => 0);
  void version;
  return availableVoices();
}

let voicesV = 0;
const voicesVersion = () => voicesV;
function subscribeVoices(l: () => void) {
  if (!speechSupported()) return () => {};
  const on = () => {
    voicesV++;
    l();
  };
  window.speechSynthesis.addEventListener("voiceschanged", on);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", on);
}

// Leaving or reloading the page must not leave the browser talking.
if (typeof window !== "undefined") window.addEventListener("pagehide", () => narrator.stop());
