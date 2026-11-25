import type { ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { PreferencesProvider } from "./PreferencesProvider";
import { ToastProvider } from "./ToastProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </PreferencesProvider>
  );
}
