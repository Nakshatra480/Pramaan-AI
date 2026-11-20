"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { services } from "@/lib/services";
import type { User } from "@/types";

/**
 * Authentication context. Currently backed by the mock auth service; swap
 * `services.auth` for a Firebase Authentication adapter to go live — the
 * `useAuth()` contract stays the same.
 */

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  loading: boolean;
  isAuthenticated: boolean;
  /** Set when the identity provider or profile service couldn't be reached. */
  error: string | null;
  /** "code" (demo) or "link" (Firebase email link). */
  verification: "code" | "link";
  retry: () => Promise<void>;
  signUpWithEmail: typeof services.auth.signUp;
  signInWithEmail: typeof services.auth.signInWithEmail;
  signInWithGoogle: typeof services.auth.signInWithGoogle;
  signUp: typeof services.auth.signUp;
  signOut: typeof services.auth.signOut;
  sendVerificationEmail: typeof services.auth.sendVerificationEmail;
  verifyEmail: typeof services.auth.verifyEmail;
  sendPasswordReset: typeof services.auth.sendPasswordReset;
  resetPassword: typeof services.auth.resetPassword;
  updateProfile: typeof services.auth.updateProfile;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      services.auth.onAuthStateChanged((u, err) => {
        setUser(u);
        setError(err ?? null);
        setStatus(u ? "authenticated" : err ? "error" : "unauthenticated");
      }),
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      loading: status === "loading",
      isAuthenticated: status === "authenticated",
      error,
      verification: services.auth.verification,
      retry: async () => {
        setStatus("loading");
        await services.auth.retry();
      },
      signUpWithEmail: services.auth.signUp,
      signInWithEmail: services.auth.signInWithEmail,
      signInWithGoogle: services.auth.signInWithGoogle,
      signUp: services.auth.signUp,
      signOut: services.auth.signOut,
      sendVerificationEmail: services.auth.sendVerificationEmail,
      verifyEmail: services.auth.verifyEmail,
      sendPasswordReset: services.auth.sendPasswordReset,
      resetPassword: services.auth.resetPassword,
      updateProfile: services.auth.updateProfile,
    }),
    [user, status, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
