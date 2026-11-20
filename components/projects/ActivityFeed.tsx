"use client";

import { FilePlus2, FolderPlus, ListChecks, Share2, UserPlus } from "lucide-react";
import Link from "next/link";
import { VerificationMark } from "@/components/animations/VerificationMark";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatRelative } from "@/lib/utils/format";
import type { ActivityItem, ActivityKind } from "@/types";

const ICON: Record<ActivityKind, React.ReactNode> = {
  research_completed: <VerificationMark size={16} />,
  document_added: <FilePlus2 className="size-4" />,
  instructions_updated: <ListChecks className="size-4" />,
  member_joined: <UserPlus className="size-4" />,
  project_created: <FolderPlus className="size-4" />,
  research_shared: <Share2 className="size-4" />,
};

export function ActivityFeed({ items, loading }: { items?: ActivityItem[]; loading?: boolean }) {
  if (loading || !items)
    return (
      <div className="space-y-5" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    );
  return (
    <ol className="relative">
      {items.map((a, i) => {
        const body = (
          <>
            <p className="text-[14px] text-ink">
              <span className="font-medium">{a.actor}</span> <span className="text-ink-muted">{verb(a.kind)}</span> {a.kind === "research_completed" ? `“${a.title}”` : a.kind === "instructions_updated" || a.kind === "member_joined" ? "" : a.title.replace(/^(Added|Created|Shared)\s*/i, "")}
            </p>
            {a.detail && <p className="text-[12.5px] text-ink-muted mt-0.5 line-clamp-1">{a.detail}</p>}
          </>
        );
        return (
          <li key={a.id} className="relative flex gap-4 pb-6 last:pb-0">
            {i < items.length - 1 && <span aria-hidden className="absolute left-4 top-9 bottom-1 w-px bg-line" />}
            <span className="relative grid place-items-center size-8 rounded-full border border-line bg-surface text-ink-muted shrink-0">{ICON[a.kind]}</span>
            <div className="min-w-0 flex-1 pt-1">
              {a.href ? (
                <Link href={a.href} className="block hover:opacity-80">
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
            <time className="text-[12px] text-ink-faint pt-1.5 whitespace-nowrap" dateTime={a.createdAt}>
              {formatRelative(a.createdAt)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

function verb(kind: ActivityKind) {
  switch (kind) {
    case "research_completed":
      return "completed research";
    case "document_added":
      return "added";
    case "instructions_updated":
      return "updated project instructions";
    case "member_joined":
      return "joined the project";
    case "project_created":
      return "created";
    case "research_shared":
      return "shared";
  }
}
