"use client";

import { createContext, useContext, type ReactNode } from "react";
import { PageTransition } from "@/components/animations/PageTransition";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import type { Project } from "@/types";
import { ProjectHeader } from "./ProjectHeader";

const Ctx = createContext<Project | null>(null);

/** Loads a project once for all nested project routes and renders the shared header + tabs. */
export function ProjectFrame({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { data: project, loading } = useResource(() => services.projects.get(projectId), [projectId]);
  if (!loading && !project)
    return <EmptyState title="Project not found" description="It may have been deleted, or you no longer have access." action={<ButtonLink href="/projects">All projects</ButtonLink>} />;
  return (
    <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-10 py-8 sm:py-12">
      <ProjectHeader project={project} />
      <div className="mt-8">{project ? <Ctx.Provider value={project}>{children}</Ctx.Provider> : <div className="h-64" />}</div>
    </div>
  );
}

export function useProject() {
  const p = useContext(Ctx);
  if (!p) throw new Error("useProject must be used within ProjectFrame");
  return p;
}

export function ProjectPage({ render }: { render: (p: Project) => ReactNode }) {
  const project = useProject();
  return <PageTransition>{render(project)}</PageTransition>;
}
