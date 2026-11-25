/**
 * Thin wrappers over the Firebase Web SDK. The UI never imports firebase/auth
 * directly — it uses `useAuth()`, which talks to `services.auth`.
 * Session persistence is IndexedDB (set below); Pramaan never stores tokens itself.
 */
import {
  applyActionCode,
  browserPopupRedirectResolver,
  confirmPasswordReset,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAuth,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  linkWithCredential,
  type OAuthCredential,
  GoogleAuthProvider,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification as fbSendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import { firebaseEnv, getFirebaseApp } from "./config";

let auth: Auth | null = null;
/** Google credential awaiting a link after `auth/account-exists-with-different-credential` (memory only). */
let pendingGoogleCredential: OAuthCredential | null = null;
/** Error code from a redirect sign-in, surfaced once by `takeRedirectError()`. */
let redirectError: string | null = null;

export function firebaseAuth(): Auth {
  if (auth) return auth;
  const app = getFirebaseApp();
  try {
    // IndexedDB only: the session (incl. tokens) never lands in localStorage/sessionStorage.
    // If IndexedDB is unavailable, Firebase falls back to in-memory persistence.
    auth = initializeAuth(app, { persistence: indexedDBLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  } catch {
    auth = getAuth(app); // already initialised (e.g. fast refresh)
  }
  // Redirect fallback (used only when the popup is blocked): the user arrives via
  // onIdTokenChanged, but errors are only reported here — capture them.
  void getRedirectResult(auth).catch((e) => {
    if ((e as { code?: string }).code === "auth/account-exists-with-different-credential") {
      pendingGoogleCredential = GoogleAuthProvider.credentialFromError(e as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
    }
    redirectError = (e as { code?: string }).code ?? "auth/unknown";
  });
  if (firebaseEnv.authEmulatorHost) connectAuthEmulator(auth, `http://${firebaseEnv.authEmulatorHost}`, { disableWarnings: false });
  return auth;
}

function actionSettings() {
  return typeof window === "undefined" ? undefined : { url: `${window.location.origin}/auth/verify`, handleCodeInApp: false };
}

export const firebase = {
  onUserChanged(cb: (u: FirebaseUser | null) => void) {
    // onIdTokenChanged also fires on token refresh and email-verification reloads.
    return onIdTokenChanged(firebaseAuth(), cb);
  },
  current: () => firebaseAuth().currentUser,
  /** Resolves once Firebase has restored any persisted session (it loads asynchronously). */
  ready: () => firebaseAuth().authStateReady(),
  async idToken(forceRefresh = false): Promise<string | null> {
    await firebaseAuth().authStateReady();
    const u = firebaseAuth().currentUser;
    return u ? u.getIdToken(forceRefresh) : null;
  },
  async signInWithEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(firebaseAuth(), email, password);
    if (pendingGoogleCredential) {
      // Same person, same email: attach Google to this account so both methods map to one UID.
      await linkWithCredential(cred.user, pendingGoogleCredential).catch(() => undefined);
      pendingGoogleCredential = null;
    }
    return cred;
  },
  async signUpWithEmail(name: string, email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(firebaseAuth(), email, password);
    if (name) await updateProfile(cred.user, { displayName: name });
    await fbSendEmailVerification(cred.user, actionSettings());
    return cred.user;
  },
  async signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      return (await signInWithPopup(firebaseAuth(), provider)).user;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "auth/popup-blocked") {
        await signInWithRedirect(firebaseAuth(), provider);
        return null;
      }
      if (code === "auth/account-exists-with-different-credential") {
        pendingGoogleCredential = GoogleAuthProvider.credentialFromError(e as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
      }
      throw e;
    }
  },
  async sendEmailVerification() {
    await firebaseAuth().authStateReady();
    const u = firebaseAuth().currentUser;
    if (u) await fbSendEmailVerification(u, actionSettings());
  },
  /** Re-reads the user (e.g. after they click the verification link) and refreshes the token claims. */
  async reloadUser() {
    await firebaseAuth().authStateReady();
    const u = firebaseAuth().currentUser;
    if (!u) return null;
    await reload(u);
    await u.getIdToken(true);
    return firebaseAuth().currentUser;
  },
  applyActionCode: (code: string) => applyActionCode(firebaseAuth(), code),
  sendPasswordReset: (email: string) => sendPasswordResetEmail(firebaseAuth(), email, { url: `${window.location.origin}/auth/login` }),
  confirmPasswordReset: (code: string, password: string) => confirmPasswordReset(firebaseAuth(), code, password),
  updateDisplayName: async (name: string) => {
    const u = firebaseAuth().currentUser;
    if (u) await updateProfile(u, { displayName: name });
  },
  signOut: () => fbSignOut(firebaseAuth()),
  /** Fresh credential for sensitive operations (account deletion): password users re-enter it; Google users confirm in a popup. */
  async reauthenticate(password?: string) {
    await firebaseAuth().authStateReady();
    const u = firebaseAuth().currentUser;
    if (!u) throw Object.assign(new Error("Not signed in"), { code: "auth/no-current-user" });
    if (u.providerData.some((p) => p.providerId === "google.com") && !password) {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account", login_hint: u.email ?? "" });
      await reauthenticateWithPopup(u, provider);
    } else {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? "", password ?? ""));
    }
  },
  /** Deletes the Firebase sign-in itself. Requires a recent sign-in (see reauthenticate). */
  async deleteCurrentUser() {
    const u = firebaseAuth().currentUser;
    if (u) await deleteUser(u);
  },
  takeRedirectError() {
    const e = redirectError;
    redirectError = null;
    return e;
  },
};

export type { FirebaseUser };
