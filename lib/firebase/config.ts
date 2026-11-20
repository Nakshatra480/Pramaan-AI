/**
 * Centralised Firebase configuration. Firebase is initialised here and nowhere else.
 * Only public client config lives in the browser (NEXT_PUBLIC_*); no secrets.
 */
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";

const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* environment variables.");
  return getApps().length ? getApp() : initializeApp(config);
}

/**
 * Auth Emulator: opt-in and development-only.
 * NEXT_PUBLIC_FIREBASE_USE_EMULATOR=true → emulator (host defaults to 127.0.0.1:9099).
 * Anything else → the real project. A production build that asks for the
 * emulator fails loudly instead of silently authenticating against it.
 */
const wantsEmulator = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR === "true";
if (wantsEmulator && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_FIREBASE_USE_EMULATOR=true is not allowed in production builds. Use `npm run dev` for emulator mode.");
}

export const firebaseEnv = {
  authEmulatorHost: wantsEmulator ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099" : undefined,
  appCheckSiteKey: process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY,
  measurementId: config.measurementId,
};
