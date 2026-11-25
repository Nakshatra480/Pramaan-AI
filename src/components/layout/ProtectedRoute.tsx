import { usePathname, useRouter } from "@/lib/navigation";
import { useEffect, type ReactNode } from "react";
import { PramaanLoader } from "@/components/brand/PramaanLoader";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ServerWakeHint } from "@/components/ui/ServerWakeHint";
import { prewarmBackend } from "@/lib/api/warmup";

/**
 * Gate for application routes. Uses `useAuth()` only, so it works unchanged
 * once auth is backed by Firebase. (Server-side token checks will live in the
 * FastAPI layer — see PRD §9.)
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, status, error, retry } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Opening the app directly (already signed in): wake the API alongside Firebase's session restore.
  useEffect(() => void prewarmBackend(), []);

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
          <PramaanLoader size={76} label="Opening your workspace" />
          <p className="mt-2 text-[14px] text-ink-muted">Opening your workspace…</p>
          <ServerWakeHint active className="max-w-xs text-center text-[12.5px] leading-snug text-ink-muted" />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
