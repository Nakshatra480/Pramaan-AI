/**
 * Optional Firebase App Check. Enabled only when a site key is configured, so
 * local development keeps working without it. The API client attaches the
 * token as `X-Firebase-AppCheck`; the backend enforces it when
 * FIREBASE_APP_CHECK_REQUIRED=true.
 */
import type { AppCheck } from "firebase/app-check";
import { firebaseEnv, getFirebaseApp, isFirebaseConfigured } from "./config";

let appCheck: Promise<AppCheck | null> | null = null;

function init(): Promise<AppCheck | null> {
  if (!appCheck) {
    appCheck =
      isFirebaseConfigured && firebaseEnv.appCheckSiteKey && typeof window !== "undefined"
        ? import("firebase/app-check").then(({ initializeAppCheck, ReCaptchaV3Provider }) =>
            initializeAppCheck(getFirebaseApp(), { provider: new ReCaptchaV3Provider(firebaseEnv.appCheckSiteKey!), isTokenAutoRefreshEnabled: true }),
          )
        : Promise.resolve(null);
  }
  return appCheck;
}

export async function appCheckToken(): Promise<string | null> {
  const ac = await init();
  if (!ac) return null;
  try {
    const { getToken } = await import("firebase/app-check");
    return (await getToken(ac)).token;
  } catch {
    return null;
  }
}
