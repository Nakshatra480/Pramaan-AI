/**
 * Firebase-backed auth adapter. Same surface as the mock adapter, so
 * `AuthProvider`/`useAuth()` and every screen stay unchanged.
 *
 * Identity: Firebase. Profile: Neon via GET /me (created on first call).
 */
import { authMessage } from "@/lib/firebase/types";
import { firebase, type FirebaseUser } from "@/lib/firebase/auth";
import { AuthError } from "@/lib/services/errors";
import type { User } from "@/types";
import type { AccountUsage, AccountExport } from "@/lib/mock/account";
import { ApiError, apiDownload, apiFetch, setUnauthenticatedHandler } from "./client";
import { API_URL } from "./config";
import type { MeDTO } from "./types";

type Listener = (user: User | null, error?: string) => void;

const listeners = new Set<Listener>();
let current: User | null | undefined;
let lastError: string | undefined;
let unsubscribeFirebase: (() => void) | null = null;
/** Preferences stored on the profile (GET /me) — the source of truth across devices. */
let remotePreferences: Record<string, unknown> | null = null;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "P"
  );
}

function toUser(fb: FirebaseUser, me: MeDTO): User {
  const name = me.displayName || fb.displayName || (fb.email ?? "Researcher").split("@")[0];
  return {
    id: me.id,
    name,
    email: fb.email ?? me.email ?? "",
    emailVerified: fb.emailVerified,
    avatarUrl: me.avatarUrl ?? fb.photoURL ?? undefined,
    initials: initials(name),
    provider: fb.providerData.some((p) => p.providerId === "google.com") ? "google" : "password",
    createdAt: me.createdAt,
    onboarded: me.onboarded,
    plan: me.plan as User["plan"],
  };
}

function emit(user: User | null, error?: string) {
  current = user;
  lastError = error;
  listeners.forEach((l) => l(user, error));
}

async function loadProfile(fb: FirebaseUser | null) {
  if (!fb) {
    remotePreferences = null;
    return emit(null);
  }
  try {
    const me = await apiFetch<MeDTO>("/me");
    remotePreferences = me.preferences ?? {};
    emit(toUser(fb, me));
  } catch (e) {
    // Firebase sign-in succeeded but the Pramaan profile bootstrap (GET /me) failed.
    const friendly = e instanceof ApiError && e.code === "NETWORK" ? "Pramaan can't be reached right now." : "We couldn't load your profile.";
    const detail = e instanceof ApiError ? `${e.code}${e.status ? ` (HTTP ${e.status})` : ""}${e.requestId ? ` · request ${e.requestId}` : ""}` : (e as Error).message;
    if (!import.meta.env.PROD) console.warn(`[pramaan/auth] Firebase user ${fb.uid} (${fb.providerData.map((p) => p.providerId).join(",")}) signed in, but GET /me failed: ${detail}`);
    emit(null, !import.meta.env.PROD ? `${friendly} [dev: ${detail} — ${API_URL}]` : friendly);
  }
}

function ensureListening() {
  if (unsubscribeFirebase) return;
  setUnauthenticatedHandler(() => void firebase.signOut());
  unsubscribeFirebase = firebase.onUserChanged((fb) => void loadProfile(fb));
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) throw e;
    const code = (e as { code?: string }).code;
    throw new AuthError(code ?? "auth/unknown", authMessage(code));
  }
}

async function waitForUser(): Promise<User> {
  if (current) return current;
  return new Promise((resolve, reject) => {
    const off = (u: User | null, err?: string) => {
      if (u) {
        listeners.delete(off);
        resolve(u);
      } else if (err) {
        listeners.delete(off);
        reject(new AuthError("auth/backend-unavailable", err));
      }
    };
    listeners.add(off);
  });
}

export const firebaseAuthService = {
  verification: "link" as "code" | "link",
  onAuthStateChanged(listener: Listener) {
    ensureListening();
    listeners.add(listener);
    if (current !== undefined || lastError) listener(current ?? null, lastError);
    return () => {
      listeners.delete(listener);
    };
  },
  currentUser: () => current ?? null,
  retry: () => loadProfile(firebase.current()),
  takeRedirectError: () => firebase.takeRedirectError(),

  signInWithEmail: (email: string, password: string) =>
    wrap(async () => {
      ensureListening();
      await firebase.signInWithEmail(email, password);
      return waitForUser();
    }),
  signInWithGoogle: () =>
    wrap(async () => {
      ensureListening();
      await firebase.signInWithGoogle();
      return waitForUser();
    }),
  signUp: (name: string, email: string, password: string) =>
    wrap(async () => {
      if (password.length < 8) throw new AuthError("auth/weak-password", authMessage("auth/weak-password"));
      ensureListening();
      await firebase.signUpWithEmail(name, email, password);
      const u = await waitForUser();
      if (name) await apiFetch<MeDTO>("/me", { method: "PATCH", body: { displayName: name } }).catch(() => undefined);
      return { ...u, name: name || u.name };
    }),
  sendVerificationEmail: () => wrap(() => firebase.sendEmailVerification()),
  /** With an oobCode (from the emailed link) applies it; otherwise re-checks verification status. */
  verifyEmail: (code?: string | null) =>
    wrap(async () => {
      if (code) await firebase.applyActionCode(code);
      const fb = await firebase.reloadUser();
      if (!fb && code) return; // verified from a signed-out browser; they'll sign in next
      if (fb && !fb.emailVerified) throw new AuthError("auth/not-verified", "We haven't seen your verification yet. Open the link in your email, then try again.");
      if (fb) await loadProfile(fb);
    }),
  sendPasswordReset: (email: string) =>
    wrap(async () => {
      try {
        await firebase.sendPasswordReset(email);
      } catch (e) {
        // Don't reveal whether an account exists.
        if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
      }
      return email;
    }),
  resetPassword: (password: string, oobCode?: string | null) =>
    wrap(async () => {
      if (!oobCode) throw new AuthError("auth/invalid-action-code", "Open the reset link from your email to choose a new password.");
      if (password.length < 8) throw new AuthError("auth/weak-password", authMessage("auth/weak-password"));
      await firebase.confirmPasswordReset(oobCode, password);
    }),
  updateProfile: (patch: Partial<Pick<User, "name" | "email" | "avatarUrl" | "onboarded">>) =>
    wrap(async () => {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.displayName = patch.name;
      if (patch.onboarded !== undefined) body.onboarded = patch.onboarded;
      if (patch.avatarUrl !== undefined && (patch.avatarUrl === null || /^https:\/\//.test(patch.avatarUrl ?? ""))) body.avatarUrl = patch.avatarUrl ?? null;
      if (patch.name) await firebase.updateDisplayName(patch.name);
      const fb = firebase.current();
      if (!fb) return;
      const me = Object.keys(body).length ? await apiFetch<MeDTO>("/me", { method: "PATCH", body }) : await apiFetch<MeDTO>("/me");
      emit(toUser(fb, me));
    }),
  savePreferences: (preferences: Record<string, unknown>) =>
    apiFetch<MeDTO>("/me", { method: "PATCH", body: { preferences } }).then((me) => void (remotePreferences = me.preferences ?? {})),
  /** Preferences saved on the profile, once it has loaded (null before sign-in). */
  storedPreferences: (): Record<string, unknown> | null => remotePreferences,
  /**
   * Permanently deletes the account: re-authenticate (fresh credential), delete every Pramaan record and
   * stored file (DELETE /me), then the Firebase sign-in. Nothing is deleted if re-authentication fails.
   */
  deleteAccount: (password?: string) =>
    wrap(async () => {
      await firebase.reauthenticate(password);
      await apiFetch<void>("/me", { method: "DELETE" });
      try {
        await firebase.deleteCurrentUser();
      } finally {
        remotePreferences = null;
        await firebase.signOut().catch(() => undefined);
        emit(null);
      }
    }),
  exportData: (): Promise<AccountExport> => apiDownload("/me/export"),
  usage: () => apiFetch<AccountUsage>("/me/usage"),
  signOut: () => wrap(() => firebase.signOut()),
};
