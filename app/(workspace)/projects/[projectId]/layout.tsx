import { ProjectFrame } from "@/components/projects/ProjectContext";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  return <ProjectFrame projectId={projectId}>{children}</ProjectFrame>;
}
