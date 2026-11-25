import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, useParams, useRouteError, useSearchParams } from "react-router";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { HistoryView } from "@/components/history/HistoryView";
import { AppShell } from "@/components/layout/AppShell";
import { DocumentViewer } from "@/components/library/DocumentViewer";
import { LibraryBrowser } from "@/components/library/LibraryBrowser";
import { ProjectsIndex } from "@/components/projects/ProjectsIndex";
import { ResearchView } from "@/components/research/ResearchView";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePageTitle } from "@/lib/navigation";

export function WorkspaceLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** Errors inside a workspace page keep the sidebar and top bar; "Try again" re-renders the page. */
export function WorkspaceError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <EmptyState
      title="Something went wrong."
      description="Pramaan couldn't load this page. Your research and documents are safe."
      action={
        <>
          <Button onClick={() => void navigate(location, { replace: true })}>Try again</Button>
          <ButtonLink href="/app" variant="secondary">
            Go home
          </ButtonLink>
        </>
      }
    />
  );
}

const param = (v: string | null) => v ?? undefined;

export function NewResearch() {
  usePageTitle("New research");
  const [search] = useSearchParams();
  return <Dashboard initialQuery={param(search.get("q"))} initialProject={param(search.get("project"))} />;
}

export function Research() {
  usePageTitle("Research");
  const { researchId = "" } = useParams();
  const [search] = useSearchParams();
  return <ResearchView key={researchId} researchId={researchId} initialSourceId={search.get("source")} />;
}

export function History() {
  usePageTitle("History");
  return <HistoryView />;
}

export function Library() {
  usePageTitle("Library");
  const [search] = useSearchParams();
  return (
    <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-10 py-10 sm:py-14">
      <PageHeader title="Library" description="Your private knowledge base. Everything here can be cited as evidence." />
      <div className="mt-8">
        <LibraryBrowser initialUpload={search.get("upload") === "1"} />
      </div>
    </div>
  );
}

export function Document() {
  usePageTitle("Document");
  const { documentId = "" } = useParams();
  return <DocumentViewer key={documentId} documentId={documentId} />;
}

export function Projects() {
  usePageTitle("Projects");
  return <ProjectsIndex />;
}
