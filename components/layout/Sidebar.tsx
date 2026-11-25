import { AnimatePresence, motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { Link } from "@/components/ui/Link";
import { usePathname } from "@/lib/navigation";
import { PramaanLogo } from "@/components/brand/PramaanLogo";
import { PramaanMark } from "@/components/brand/PramaanMark";
import { Tooltip } from "@/components/ui/Tooltip";
import { useResource } from "@/lib/hooks/use-resource";
import { spring } from "@/lib/motion";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import { NAV } from "./nav";
import { UserMenu } from "./UserMenu";
import { useWorkspace } from "./WorkspaceContext";

export function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: recent } = useResource(() => services.research.list(), []);
  const { toggleSidebar } = useWorkspace();

  const item = (href: string, label: string, Icon: React.ComponentType<{ className?: string }>, active: boolean) => {
    const link = (
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 h-9 rounded-md text-[13.5px] font-medium transition-colors duration-150",
          collapsed ? "justify-center w-10 mx-auto" : "px-2.5",
          active ? "text-ink" : "text-ink-muted hover:text-ink hover:bg-subtle",
        )}
      >
        {active && <motion.span layoutId="nav-active" transition={spring.snappy} className="absolute inset-0 rounded-md bg-raised border border-line shadow-xs" />}
        <Icon className="relative size-[18px] shrink-0" />
        {!collapsed && <span className="relative truncate">{label}</span>}
      </Link>
    );
    return collapsed ? (
      <Tooltip key={href} content={label} placement="top">
        {link}
      </Tooltip>
    ) : (
      <div key={href}>{link}</div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center shrink-0", collapsed ? "justify-center" : "justify-between px-4")}>
        <Link href="/app" onClick={onNavigate} aria-label="Pramaan AI home" className="rounded-md">
          {collapsed ? <PramaanMark size={28} /> : <PramaanLogo variant="compact" size="sm" />}
        </Link>
        {!collapsed && !onNavigate && (
          <button type="button" onClick={toggleSidebar} aria-label="Collapse sidebar" title="Collapse sidebar" className="hidden lg:grid place-items-center size-7 rounded-md text-ink-faint hover:text-ink hover:bg-subtle">
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      <div className={cn("px-3 pt-6 pb-2", collapsed && "px-0 flex justify-center")}>
        {collapsed ? (
          <Tooltip content="New research">
            <Link href="/research/new" aria-label="New research" onClick={onNavigate} className="grid place-items-center size-10 rounded-lg bg-ink text-bg hover:bg-ink-2 transition-colors active:scale-[0.97]">
              <Plus className="size-[18px]" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/research/new"
            onClick={onNavigate}
            className="group flex items-center gap-2.5 h-10 px-3 rounded-lg bg-ink text-bg text-[13.5px] font-medium hover:bg-ink-2 transition-[background-color,transform] active:scale-[0.98]"
          >
            <Plus className="size-4" />
            New research
          </Link>
        )}
      </div>

      <nav aria-label="Primary" className={cn("mt-5 space-y-0.5", collapsed ? "px-0" : "px-3")}>
        {NAV.map((n) => item(n.href, n.label, n.icon, n.match(pathname)))}
      </nav>

      <div className="mt-8 flex-1 min-h-0 overflow-y-auto thin-scrollbar">
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="px-3">
              <p className="px-2.5 mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">Recent research</p>
              <ul className="space-y-px">
                {(recent ?? []).slice(0, 6).map((r) => {
                  const active = pathname === `/research/${r.id}`;
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/research/${r.id}`}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px] transition-colors",
                          active ? "bg-subtle text-ink" : "text-ink-muted hover:text-ink hover:bg-subtle",
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full shrink-0", r.status === "running" ? "bg-accent animate-pulse-soft" : r.status === "complete" ? "bg-sage-deep" : "bg-line-strong")} aria-hidden />
                        <span className="truncate">{r.title}</span>
                      </Link>
                    </li>
                  );
                })}
                {!recent &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="h-8 px-2.5 flex items-center">
                      <span className="skeleton h-2.5 rounded w-full" />
                    </li>
                  ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={cn("shrink-0 border-t border-line py-3 space-y-0.5", collapsed ? "px-0" : "px-3")}>
        {item("/settings", "Settings", Settings, pathname.startsWith("/settings"))}
        <UserMenu collapsed={collapsed} />
        {collapsed && !onNavigate && (
          <Tooltip content="Expand sidebar">
            <button type="button" onClick={toggleSidebar} aria-label="Expand sidebar" className="hidden lg:grid mx-auto place-items-center size-9 rounded-md text-ink-faint hover:text-ink hover:bg-subtle">
              <PanelLeftOpen className="size-4" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed } = useWorkspace();
  return (
    <>
      {/* Tablet: always a rail */}
      <aside className="hidden md:block lg:hidden fixed inset-y-0 left-0 z-[var(--z-sidebar)] w-[72px] border-r border-line bg-bg">
        <SidebarContent collapsed />
      </aside>
      {/* Desktop: expandable */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 72 : 264 }}
        transition={spring.gentle}
        className="hidden lg:block fixed inset-y-0 left-0 z-[var(--z-sidebar)] border-r border-line bg-bg overflow-hidden"
      >
        <SidebarContent collapsed={sidebarCollapsed} />
      </motion.aside>
    </>
  );
}
