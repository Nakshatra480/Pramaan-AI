import { Outlet, ScrollRestoration, isRouteErrorResponse, useRouteError } from "react-router";
import { PramaanLoader } from "@/components/brand/PramaanLoader";
import { PramaanLogo } from "@/components/brand/PramaanLogo";
import { AppProviders } from "@/components/providers/AppProviders";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "@/components/ui/Link";
import { usePageTitle } from "@/lib/navigation";

export function RootLayout() {
  return (
    <AppProviders>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
        Skip to content
      </a>
      <Outlet />
      <ScrollRestoration />
    </AppProviders>
  );
}

/** Shown while the first route's code loads. */
export function AppLoading() {
  return (
    <div className="min-h-dvh grid place-items-center bg-bg" aria-busy="true">
      <PramaanLoader size={64} label="Loading" />
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="h-16 flex items-center px-6">
        <Link href="/" aria-label="Pramaan AI">
          <PramaanLogo variant="compact" size="sm" />
        </Link>
      </header>
      <main id="main" className="flex-1 grid place-items-center px-4">
        {children}
      </main>
    </div>
  );
}

export function NotFound() {
  usePageTitle("Page not found");
  return (
    <Frame>
      <EmptyState title="There's no evidence of this page." description="The link may be broken, or the page may have moved." action={<ButtonLink href="/">Back to Pramaan</ButtonLink>} />
    </Frame>
  );
}

/** Last-resort boundary (outside the workspace, or when a page's code fails to load after a deploy). */
export function RootError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  console.error(error);
  return (
    <Frame>
      <EmptyState
        title="Something went wrong."
        description="Pramaan couldn't load this page. Reloading usually fixes it."
        action={
          <>
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <ButtonLink href="/" variant="secondary">
              Go to homepage
            </ButtonLink>
          </>
        }
      />
    </Frame>
  );
}
