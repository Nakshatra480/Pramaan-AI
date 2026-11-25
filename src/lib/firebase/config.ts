/**
 * Centralised Firebase configuration. Firebase is initialised here and nowhere else.
 * Only public client config lives in the browser (VITE_*); no secrets.
 */
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";

const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured. Set VITE_FIREBASE_* environment variables.");
  return getApps().length ? getApp() : initializeApp(config);
}

/**
 * Auth Emulator: opt-in and development-only.
 * VITE_FIREBASE_USE_EMULATOR=true → emulator (host defaults to 127.0.0.1:9099).
 * Anything else → the real project. A production build that asks for the
 * emulator fails loudly instead of silently authenticating against it.
 */
const wantsEmulator = import.meta.env.VITE_FIREBASE_USE_EMULATOR === "true";
if (wantsEmulator && import.meta.env.MODE === "production") {
  throw new Error("VITE_FIREBASE_USE_EMULATOR=true is not allowed in production builds. Use `npm run dev` for emulator mode.");
}

export const firebaseEnv = {
  authEmulatorHost: wantsEmulator ? import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099" : undefined,
  appCheckSiteKey: import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY,
  measurementId: config.measurementId,
};
