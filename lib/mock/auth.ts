import type { User } from "@/types";
import { AuthError } from "@/lib/services/errors";
import { type AccountExport, type AccountUsage, mockExport, mockUsage } from "./account";
import { db, latency } from "./db";

export { AuthError };

/**
 * Mock authentication. The surface intentionally mirrors the Firebase Web SDK
 * (onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, …) so a
 * Firebase-backed implementation can drop in behind `lib/services`.
 */

const KEY = "pramaan.auth.v1";


type Listener = (user: User | null, error?: string) => void;
const listeners = new Set<Listener>();
let current: User | null | undefined;

function read(): User | null {
  if (current !== undefined) return current;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    current = raw ? (JSON.parse(raw) as User) : null;
  } catch {
    current = null;
  }
  return current;
}

function write(user: User | null) {
  current = user;
  try {
    if (user) window.localStorage.setItem(KEY, JSON.stringify(user));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l(user));
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function makeUser(name: string, email: string, provider: User["provider"], verified: boolean): User {
  return {
    id: "u-me",
    name,
    email,
    emailVerified: verified,
    initials: initialsOf(name) || "P",
    provider,
    createdAt: new Date().toISOString(),
    onboarded: false,
    plan: "free",
  };
}

export const authService = {
  /** Mock mode verifies with a 6-digit code; Firebase uses an emailed link. */
  verification: "code" as "code" | "link",
  onAuthStateChanged(listener: Listener) {
    listeners.add(listener);
    listener(read());
    return () => {
      listeners.delete(listener);
    };
  },
  currentUser() {
    return read();
  },
  async retry() {},
  takeRedirectError: (): string | null => null,
  async savePreferences(_preferences: Record<string, unknown>) {},
  /** Demo mode keeps preferences in this browser only. */
  storedPreferences: (): Record<string, unknown> | null => null,
  /** Demo mode: clears the demo store and signs out. */
  async deleteAccount(_password?: string) {
    await latency(500);
    db.reset();
    write(null);
  },
  async exportData(): Promise<AccountExport> {
    const u = read();
    return mockExport({ id: u?.id, email: u?.email, displayName: u?.name, createdAt: u?.createdAt });
  },
  async usage(): Promise<AccountUsage> {
    return mockUsage(read()?.plan ?? "free");
  },
  async signInWithEmail(email: string, password: string) {
    await latency(700);
    if (password.length < 6 || /wrong/i.test(password)) {
      throw new AuthError("auth/invalid-credential", "That email and password combination didn't match our records.");
    }
    const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const user = { ...makeUser(name || "Researcher", email, "password", true), onboarded: true };
    write(user);
    return user;
  },
  async signInWithGoogle() {
    await latency(900);
    const user = { ...makeUser("Aarav Mehta", "aarav.mehta@gmail.com", "google", true), onboarded: true };
    write(user);
    return user;
  },
  async signUp(name: string, email: string, password: string) {
    await latency(800);
    if (password.length < 8) throw new AuthError("auth/weak-password", "Use at least 8 characters for your password.");
    if (/taken@/i.test(email)) throw new AuthError("auth/email-already-in-use", "An account with this email already exists.");
    const user = makeUser(name, email, "password", false);
    write(user);
    return user;
  },
  async sendVerificationEmail() {
    await latency(600);
  },
  async verifyEmail(code?: string | null) {
    await latency(700);
    if (!code || !/^\d{6}$/.test(code)) throw new AuthError("auth/invalid-code", "Enter the 6-digit code from your email.");
    const u = read();
    if (u) write({ ...u, emailVerified: true });
  },
  async sendPasswordReset(email: string) {
    await latency(700);
    return email;
  },
  async resetPassword(password: string, _oobCode?: string | null) {
    await latency(700);
    if (password.length < 8) throw new AuthError("auth/weak-password", "Use at least 8 characters for your password.");
  },
  async updateProfile(patch: Partial<Pick<User, "name" | "email" | "avatarUrl" | "onboarded">>) {
    await latency(400);
    const u = read();
    if (!u) return;
    const next = { ...u, ...patch };
    if (patch.name) next.initials = initialsOf(patch.name);
    write(next);
  },
  async signOut() {
    await latency(200);
    write(null);
  },
};
