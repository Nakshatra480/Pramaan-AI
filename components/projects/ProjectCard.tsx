import { FileText, Search } from "lucide-react";
import { Link } from "@/components/ui/Link";
import { AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { isOwnProject } from "@/lib/utils/projects";
import { formatRelative } from "@/lib/utils/format";
import type { Project } from "@/types";
import { ProjectIcon } from "./ProjectIcon";

export function ProjectCard({ project }: { project: Project }) {
  const shared = !isOwnProject(project);
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col h-full rounded-xl border border-line bg-surface p-5 transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <ProjectIcon icon={project.icon} />
        <div className="flex items-center gap-2">
          {shared && <Badge tone="outline">Shared</Badge>}
          <AvatarStack people={project.members} size={22} />
        </div>
      </div>
      <h2 className="mt-5 font-display text-[24px] leading-tight text-ink">{project.name}</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted line-clamp-2 flex-1">{project.description || "No description yet."}</p>
      <div className="mt-5 pt-4 border-t border-line flex items-center gap-4 text-[12.5px] text-ink-muted tabular">
        <span className="inline-flex items-center gap-1.5">
          <Search className="size-3.5 text-ink-faint" />
          {project.researchCount} research
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="size-3.5 text-ink-faint" />
          {project.documentIds.length} documents
        </span>
        <span className="ml-auto text-ink-faint">{formatRelative(project.updatedAt)}</span>
      </div>
    </Link>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl border border-line/70 p-5 h-[212px]" aria-hidden>
      <Skeleton className="size-10 rounded-lg" />
      <Skeleton className="mt-5 h-6 w-2/3" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-8 h-3 w-1/2" />
    </div>
  );
}
