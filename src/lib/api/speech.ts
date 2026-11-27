import { apiFetch } from "./client";

/** A dictation after clean-up, with exactly what was recognised (so the user can undo the clean-up). */
export interface Dictation {
  text: string;
  original: string;
}

/** Transcribes a voice recording (browsers without built-in speech recognition) and cleans it up in one request. */
export async function apiTranscribe(audio: Blob, language?: string, context = ""): Promise<Dictation> {
  const form = new FormData();
  const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", audio, `voice.${ext}`);
  if (language && /^[a-z]{2}$/.test(language)) form.append("language", language);
  if (context.trim()) form.append("context", context.slice(0, 2000));
  return apiFetch<Dictation>("/speech/transcriptions", { method: "POST", body: form });
}

/** Cleans up text dictated with the browser's own speech recognition: fillers, misheard words, spelling. */
export async function apiRefine(text: string, context = ""): Promise<Dictation> {
  return apiFetch<Dictation>("/speech/refinements", { method: "POST", body: { text: text.slice(0, 4000), context: context.slice(0, 2000) } });
}
