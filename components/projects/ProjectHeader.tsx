"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { isOwnProject } from "@/lib/utils/projects";
import type { Project } from "@/types";
import { ProjectIcon } from "./ProjectIcon";

export function ProjectHeader({ project }: { project?: Project | null }) {
  const pathname = usePathname();
  if (!project)
    return (
      <div className="space-y-4" aria-hidden>
        <Skeleton className="h-3 w-20" />
        <div className="flex gap-4 items-center">
          <Skeleton className="size-14 rounded-xl" />
          <Skeleton className="h-10 w-64" />
        </div>
        <Skeleton className="h-10 w-full mt-6" />
      </div>
    );

  const base = `/projects/${project.id}`;
  const tabs = [
    { value: "research", label: "Research", href: base },
    { value: "library", label: "Library", href: `${base}/library`, count: project.documentIds.length },
    { value: "instructions", label: "Instructions", href: `${base}/instructions` },
    { value: "activity", label: "Activity", href: `${base}/activity` },
    { value: "settings", label: "Settings", href: `${base}/settings` },
  ];
  const active = tabs.slice(1).find((t) => pathname.startsWith(t.href))?.value ?? "research";

  return (
    <header>
      <Link href="/projects" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Projects
      </Link>
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
        <ProjectIcon icon={project.icon} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[36px] sm:text-[42px] leading-none text-ink">{project.name}</h1>
            {!isOwnProject(project) && <Badge tone="outline">Shared by {project.ownerName}</Badge>}
          </div>
          {project.description && <p className="mt-2 text-[14.5px] text-ink-muted max-w-2xl">{project.description}</p>}
        </div>
        <AvatarStack people={project.members} size={28} />
      </div>
      <Tabs label="Project sections" items={tabs} value={active} className="mt-8" />
    </header>
  );
}
