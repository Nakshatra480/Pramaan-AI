import { isFirebaseConfigured } from "@/lib/firebase/config";

export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/**
 * "api"  → Firebase Auth + FastAPI backend.
 * "mock" → in-browser demo data (no credentials needed).
 * Defaults to "api" when both the backend URL and Firebase config are present.
 */
export const DATA_SOURCE: "api" | "mock" =
  import.meta.env.VITE_DATA_SOURCE === "mock" ? "mock" : import.meta.env.VITE_DATA_SOURCE === "api" || (API_URL && isFirebaseConfigured) ? "api" : "mock";
