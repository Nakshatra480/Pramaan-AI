/**
 * Voice input for the research composer.
 *
 * - "native": the browser's speech recognition (Chrome, Edge, Safari) — live, word-by-word transcript.
 * - "server": browsers without it (Firefox) record a clip with MediaRecorder; the API transcribes it.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceEngine = "native" | "server";
export type VoiceState = "idle" | "starting" | "listening" | "transcribing";

/** Stop after this long without new speech (native) and never record longer than MAX_MS. */
export const SILENCE_MS = 8000;
export const MAX_MS = 120_000;

// Minimal typing for the Web Speech recognition API (not in TypeScript's DOM lib).
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"];

export function recorderMimeType(): string | null {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return null;
  return RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Which engine this browser can use, given whether the server fallback is available. */
export function voiceEngine(serverAvailable: boolean): VoiceEngine | null {
  if (recognitionCtor()) return "native";
  if (serverAvailable && typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function" && recorderMimeType() !== null) return "server";
  return null;
}

/** Joins the transcript list from a recognition event into one string. */
export function transcriptOf(results: ArrayLike<RecognitionResult>): { text: string; final: boolean } {
  let text = "";
  let final = true;
  for (let i = 0; i < results.length; i++) {
    text += results[i][0].transcript;
    if (!results[i].isFinal) final = false;
  }
  return { text: text.replace(/\s+/g, " ").trim(), final };
}

/** Appends dictated text to what was already typed, with sensible spacing and capitalisation. */
export function appendDictation(base: string, spoken: string): string {
  const s = spoken.trim();
  if (!s) return base;
  const b = base.replace(/\s+$/, "");
  if (!b) return s.charAt(0).toUpperCase() + s.slice(1);
  return `${b} ${/[.!?]$/.test(b) ? s.charAt(0).toUpperCase() + s.slice(1) : s}`;
}

/** Plain-language message for a recognition / microphone error code; null for "nothing to report". */
export function voiceErrorMessage(code: string): string | null {
  switch (code) {
    case "no-speech":
    case "aborted":
      return null;
    case "not-allowed":
    case "NotAllowedError":
    case "service-not-allowed":
    case "SecurityError":
      return "Microphone access is blocked. Allow it for this site in your browser settings, then try again.";
    case "audio-capture":
    case "NotFoundError":
    case "NotReadableError":
      return "No microphone was found, or another app is using it.";
    case "network":
      return "Voice input needs an internet connection. Check your connection and try again.";
    case "language-not-supported":
      return "Voice input doesn't support your browser's language yet.";
    default:
      return "Voice input stopped unexpectedly. Please try again.";
  }
}

interface Options {
  /** Live transcript for this dictation (replaces the previous call's text, not appended). */
  onTranscript: (text: string, final: boolean) => void;
  onError: (message: string) => void;
  /** Server fallback (API mode): returns the transcript of a recording. */
  transcribe?: ((audio: Blob, language?: string) => Promise<string>) | null;
}

export function useVoiceInput({ onTranscript, onError, transcribe }: Options) {
  const [state, setState] = useState<VoiceState>("idle");
  const [engine] = useState<VoiceEngine | null>(() => voiceEngine(Boolean(transcribe)));
  const cb = useRef({ onTranscript, onError, transcribe });
  useEffect(() => {
    cb.current = { onTranscript, onError, transcribe };
  });
  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const disposed = useRef(false);
  const timers = useRef<{ silence?: ReturnType<typeof setTimeout>; max?: ReturnType<typeof setTimeout> }>({});

  const clearTimers = () => {
    clearTimeout(timers.current.silence);
    clearTimeout(timers.current.max);
  };

  const stop = useCallback(() => {
    clearTimers();
    recognition.current?.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const startNative = () => {
    const Ctor = recognitionCtor()!;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    const armSilence = () => {
      clearTimeout(timers.current.silence);
      timers.current.silence = setTimeout(() => r.stop(), SILENCE_MS);
    };
    r.onstart = () => {
      setState("listening");
      armSilence();
    };
    r.onresult = (e) => {
      armSilence();
      const { text, final } = transcriptOf(e.results);
      cb.current.onTranscript(text, final);
    };
    r.onerror = (e) => {
      const msg = voiceErrorMessage(e.error);
      if (msg) cb.current.onError(msg);
    };
    r.onend = () => {
      clearTimers();
      recognition.current = null;
      setState("idle");
    };
    recognition.current = r;
    timers.current.max = setTimeout(() => r.stop(), MAX_MS);
    r.start();
  };

  const startServer = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setState("idle");
      cb.current.onError(voiceErrorMessage((e as DOMException).name) ?? "Couldn't start the microphone.");
      return;
    }
    const type = recorderMimeType() || undefined;
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = async () => {
      clearTimers();
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      if (disposed.current) return;
      const blob = new Blob(parts, { type: rec.mimeType || type || "audio/webm" });
      if (blob.size < 1024) {
        setState("idle");
        cb.current.onError("Pramaan didn't hear anything. Hold the mic a little closer and try again.");
        return;
      }
      setState("transcribing");
      try {
        const text = await cb.current.transcribe!(blob, (navigator.language || "en").slice(0, 2).toLowerCase());
        if (text) cb.current.onTranscript(text, true);
        else cb.current.onError("Pramaan didn't catch that. Try speaking a little closer to the microphone.");
      } catch (e) {
        cb.current.onError(e instanceof Error ? e.message : "Couldn't transcribe your recording.");
      } finally {
        setState("idle");
      }
    };
    recorder.current = rec;
    rec.start();
    setState("listening");
    timers.current.max = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_MS);
  };

  const start = useCallback(() => {
    if (!engine || state !== "idle") return;
    setState("starting");
    try {
      if (engine === "native") startNative();
      else void startServer();
    } catch {
      setState("idle");
      cb.current.onError("Voice input couldn't start. Please try again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, state]);

  // Release the microphone if the composer unmounts mid-dictation.
  useEffect(
    () => () => {
      disposed.current = true;
      clearTimers();
      recognition.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  return { supported: engine !== null, engine, state, active: state !== "idle", start, stop, toggle: () => (state === "idle" ? start() : stop()) };
}
