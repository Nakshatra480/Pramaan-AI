"use client";

import { AlertTriangle, Bookmark, FolderClosed } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import type { Project, Research } from "@/types";
import { MODES } from "./research-options";

export function ResearchRow({ research, project, showProject = true }: { research: Research; project?: Project; showProject?: boolean }) {
  const failed = research.status === "failed" || research.status === "timeout" || research.status === "no_sources";
  return (
    <Link href={`/research/${research.id}`} className="group flex items-start gap-4 py-4 px-3 -mx-3 rounded-lg hover:bg-subtle/70 transition-colors">
      <span
        className={cn(
          "mt-2 size-2 rounded-full shrink-0",
          research.status === "running" ? "bg-accent animate-pulse-soft" : failed ? "bg-warn" : "bg-sage-deep",
        )}
        aria-hidden
      />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-medium text-ink truncate group-hover:underline decoration-line-strong underline-offset-4">{research.title}</span>
          {research.saved && <Bookmark className="size-3.5 text-sage-ink fill-sage shrink-0" aria-label="Saved" />}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-ink-muted tabular">
          {research.status === "running" ? (
            <span className="text-sage-ink font-medium">Researching…</span>
          ) : failed ? (
            <span className="inline-flex items-center gap-1 text-warn">
              <AlertTriangle className="size-3" />
              {research.status === "timeout" ? "Timed out" : research.status === "no_sources" ? "Not enough sources" : "Couldn't complete"}
            </span>
          ) : (
            <>
              <span>{research.metrics.sources} sources</span>
              <span aria-hidden className="text-line-strong">·</span>
              <span className="text-sage-ink">{research.metrics.verifiedClaims} verified claims</span>
            </>
          )}
          <span aria-hidden className="text-line-strong">·</span>
          <span>{MODES.find((m) => m.value === research.mode)?.label}</span>
          {showProject && project && (
            <>
              <span aria-hidden className="text-line-strong">·</span>
              <span className="inline-flex items-center gap-1">
                <FolderClosed className="size-3" />
                {project.name}
              </span>
            </>
          )}
        </span>
      </span>
      <span className="text-[12px] text-ink-faint whitespace-nowrap pt-1 tabular">{formatRelative(research.createdAt)}</span>
    </Link>
  );
}

export function ResearchRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-4 py-4">
          <Skeleton className="mt-1.5 size-2 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}
