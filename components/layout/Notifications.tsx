"use client";

import { Bell, FileCheck2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { VerificationMark } from "@/components/animations/VerificationMark";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { IconButton } from "@/components/ui/IconButton";
import { Popover } from "@/components/ui/Popover";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { notificationKinds } from "@/lib/utils/notifications";

/** Meaningful, low-volume notifications (PRD §47): research complete + document indexed. */
const SEEN_KEY = "pramaan.notifications.seenAt";

function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function Notifications() {
  const { data } = useResource(() => services.projects.activity(undefined, 30), []);
  const { prefs } = usePreferences();
  // Read state persists per device; first visit treats everything as unread.
  const [seenAt, setSeen] = useState<string>(() => (typeof window === "undefined" ? "" : readSeen()));
  const setSeenAt = (v: string) => {
    setSeen(v);
    try {
      window.localStorage.setItem(SEEN_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };
  const kinds = notificationKinds(prefs.notifications);
  const items = (data ?? []).filter((a) => kinds.includes(a.kind)).slice(0, 6);
  const unread = items.filter((a) => a.createdAt > seenAt).length;

  return (
    <Popover
      label="Notifications"
      placement="bottom-end"
      className="w-[min(360px,calc(100vw-24px))]"
      onOpenChange={(o) => {
        if (!o) setSeenAt(new Date().toISOString());
      }}
      trigger={
        <IconButton label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative">
          <Bell className="size-[18px]" />
          {unread > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-accent ring-2 ring-bg" />}
        </IconButton>
      }
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-4 h-12 border-b border-line">
            <p className="text-[13.5px] font-medium">Notifications</p>
            {unread > 0 && (
              <button type="button" className="text-[12.5px] text-ink-muted hover:text-ink" onClick={() => setSeenAt(new Date().toISOString())}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[380px] overflow-y-auto thin-scrollbar py-1.5">
            {items.map((a) => (
              <li key={a.id}>
                <Link href={a.href ?? "#"} onClick={close} className="flex gap-3 px-4 py-3 hover:bg-subtle transition-colors">
                  <span className="mt-0.5">
                    {a.kind === "research_completed" ? <VerificationMark size={20} /> : <FileCheck2 className="size-5 text-ink-muted" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{a.kind === "research_completed" ? "Research complete" : "Document indexed"}</span>
                    <span className="block text-[13px] text-ink-muted line-clamp-2">{a.kind === "research_completed" ? `Your research on “${a.title}” is ready.` : `${a.title.replace(/^Added /, "")} is ready for research.`}</span>
                    {a.detail && <span className="block text-[12px] text-ink-faint mt-0.5">{a.detail}</span>}
                  </span>
                  <span className={cn("text-[11.5px] whitespace-nowrap", a.createdAt > seenAt ? "text-accent font-medium" : "text-ink-faint")}>{formatRelative(a.createdAt)}</span>
                </Link>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-4 py-8 text-center text-[13px] text-ink-muted">{kinds.length ? "You’re all caught up." : "Notifications are turned off in Settings."}</li>
            )}
          </ul>
        </div>
      )}
    </Popover>
  );
}
