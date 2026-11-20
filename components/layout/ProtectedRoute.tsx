"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PramaanResearchAnimation } from "@/components/animations/PramaanResearchAnimation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Gate for application routes. Uses `useAuth()` only, so it works unchanged
 * once auth is backed by Firebase. (Server-side token checks will live in the
 * FastAPI layer — see PRD §9.)
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, status, error, retry } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
    else if (user && !user.emailVerified) router.replace("/auth/verify");
    else if (user && !user.onboarded) router.replace("/onboarding");
  }, [status, user, router, pathname]);

  if (status === "error") {
    return (
      <div className="min-h-dvh grid place-items-center bg-bg px-4">
        <EmptyState
          title="Pramaan can't reach your workspace."
          description={error ?? "Please check your connection and try again."}
          action={
            <>
              <Button onClick={() => void retry()}>Try again</Button>
              <ButtonLink href="/" variant="secondary">
                Go to homepage
              </ButtonLink>
            </>
          }
        />
      </div>
    );
  }

  if (status !== "authenticated" || !user?.emailVerified || !user.onboarded) {
    return (
      <div className="min-h-dvh grid place-items-center bg-bg" aria-busy="true">
        <div className="flex flex-col items-center gap-4">
          <PramaanResearchAnimation autoplay size={120} label="Opening your workspace" />
          <p className="text-[13px] text-ink-muted">Opening your workspace…</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
