import { Outlet, useParams } from "react-router";
import { ProjectFrame } from "@/components/projects/ProjectContext";
import { ProjectActivityRoute, ProjectInstructionsRoute, ProjectLibraryRoute, ProjectResearchRoute, ProjectSettingsRoute } from "@/components/projects/ProjectRoutes";
import { usePageTitle } from "@/lib/navigation";

export function ProjectLayout() {
  const { projectId = "" } = useParams();
  return (
    <ProjectFrame projectId={projectId}>
      <Outlet />
    </ProjectFrame>
  );
}

export function ProjectResearch() {
  usePageTitle("Project research");
  return <ProjectResearchRoute />;
}

export function ProjectLibrary() {
  usePageTitle("Project library");
  return <ProjectLibraryRoute />;
}

export function ProjectInstructions() {
  usePageTitle("Project instructions");
  return <ProjectInstructionsRoute />;
}

export function ProjectActivity() {
  usePageTitle("Project activity");
  return <ProjectActivityRoute />;
}

export function ProjectSettings() {
  usePageTitle("Project settings");
  return <ProjectSettingsRoute />;
}
