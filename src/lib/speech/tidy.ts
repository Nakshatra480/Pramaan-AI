/**
 * Deterministic clean-up of dictated text — the same rules as the API's fallback (backend/app/services/speech.py).
 * Used in demo mode and whenever the API's model-based clean-up can't be reached.
 */
const SILENCE = new Set([
  "thank you", "thanks", "thank you very much", "thanks for watching", "thank you for watching", "thanks for listening",
  "please subscribe", "subscribe", "bye", "you", "okay", "ok", "so", "um", "uh", "hmm", "music", "applause", "silence",
]); // prettier-ignore
const BRACKETED = /[[(](?:music|applause|laughter|noise|silence|inaudible|background noise|blank_audio)[\])]/gi;
const FILLERS = /(?<![\w'])(?:u+h+m*|u+m+|e+r+m+|e+r+|a+h+|h+m+|m+h*m+|uh[- ]huh)(?![\w'])[,.]?\s*/gi;
const REPEAT = /\b(\w+)(?:[,\s]+\1\b)+/gi;
const LEAD = /^(?:(?:so|okay|ok|well|like|right|alright|hey|basically|actually)[,.]?\s+)+/i;
const QUESTION = /^(?:what|which|who|whom|whose|when|where|why|how|is|are|was|were|does|do|did|can|could|should|would|will|has|have)\b/i;

/** True when a transcript is only a phrase speech engines produce from silence or noise. */
export function isSilence(text: string): boolean {
  const plain = text
    .replace(BRACKETED, " ")
    .toLowerCase()
    .replace(/[^a-z' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !plain || SILENCE.has(plain);
}

/** Drops noise tags, filler sounds and stutters, fixes spacing and capitalisation, and ends a question with "?". */
export function tidyDictation(text: string): string {
  let t = text.replace(BRACKETED, " ").replace(FILLERS, " ").replace(REPEAT, "$1");
  t = t.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim().replace(/^[\s,;]+|[\s,;]+$/g, "");
  t = t.replace(LEAD, "");
  if (!t || isSilence(t)) return "";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += QUESTION.test(t) ? "?" : ".";
  return t;
}
