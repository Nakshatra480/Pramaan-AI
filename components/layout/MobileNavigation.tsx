"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { cn } from "@/lib/utils/cn";
import { NAV } from "./nav";
import { SidebarContent } from "./Sidebar";
import { useWorkspace } from "./WorkspaceContext";

export function MobileNavigation() {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen } = useWorkspace();
  const hideBottom = pathname.startsWith("/research/") && pathname !== "/research/new";

  return (
    <>
      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} side="left" title="Navigation" hideTitle className="[&>div:first-child]:hidden">
        <SidebarContent collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
      </Drawer>

      {!hideBottom && (
        <nav aria-label="Primary" className="md:hidden fixed bottom-0 inset-x-0 z-[var(--z-sidebar)] border-t border-line bg-bg/92 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <ul className="grid grid-cols-5 h-16">
            {NAV.slice(0, 2).map((n) => (
              <Tab key={n.href} href={n.href} label={n.label} Icon={n.icon} active={n.match(pathname)} />
            ))}
            <li className="grid place-items-center">
              <Link href="/research/new" aria-label="New research" className="grid place-items-center size-11 rounded-2xl bg-ink text-bg shadow-md active:scale-95 transition-transform">
                <Plus className="size-5" />
              </Link>
            </li>
            {NAV.slice(2).map((n) => (
              <Tab key={n.href} href={n.href} label={n.label} Icon={n.icon} active={n.match(pathname)} />
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}

function Tab({ href, label, Icon, active }: { href: string; label: string; Icon: React.ComponentType<{ className?: string }>; active: boolean }) {
  return (
    <li>
      <Link href={href} aria-current={active ? "page" : undefined} className={cn("h-full flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors", active ? "text-ink" : "text-ink-faint")}>
        <Icon className="size-5" />
        {label}
      </Link>
    </li>
  );
}
