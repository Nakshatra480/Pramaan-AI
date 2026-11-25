import { apiFetch } from "./client";

/** Transcribes a voice recording (browsers without built-in speech recognition). */
export async function apiTranscribe(audio: Blob, language?: string): Promise<string> {
  const form = new FormData();
  const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", audio, `voice.${ext}`);
  if (language && /^[a-z]{2}$/.test(language)) form.append("language", language);
  const { text } = await apiFetch<{ text: string }>("/speech/transcriptions", { method: "POST", body: form });
  return text;
}
