import { Menu as MenuIcon, Search } from "lucide-react";
import { Link } from "@/components/ui/Link";
import { usePathname } from "@/lib/navigation";
import { PramaanMark } from "@/components/brand/PramaanMark";
import { IconButton } from "@/components/ui/IconButton";
import { HelpMenu } from "./HelpMenu";
import { pageTitle } from "./nav";
import { Notifications } from "./Notifications";
import { UserMenu } from "./UserMenu";
import { useWorkspace } from "./WorkspaceContext";

export function TopBar() {
  const pathname = usePathname();
  const { setCommandOpen, setMobileNavOpen } = useWorkspace();

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] h-14 md:h-16 flex items-center gap-2 px-3 sm:px-4 md:px-6 bg-bg/85 backdrop-blur-md border-b border-line/70">
      <IconButton label="Open navigation" className="md:hidden" onClick={() => setMobileNavOpen(true)}>
        <MenuIcon className="size-5" />
      </IconButton>
      <Link href="/app" className="md:hidden flex items-center gap-2" aria-label="Pramaan AI home">
        <PramaanMark size={24} />
      </Link>
      <p className="hidden md:block text-[13.5px] font-medium text-ink-muted" aria-live="polite">
        {pageTitle(pathname)}
      </p>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="hidden sm:flex items-center gap-2 h-9 w-[240px] lg:w-[300px] pl-3 pr-1.5 rounded-lg border border-line bg-surface text-[13px] text-ink-faint hover:border-line-strong hover:text-ink-muted transition-colors"
        aria-label="Search"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left truncate">Search Pramaan…</span>
      </button>
      <IconButton label="Search" className="sm:hidden" onClick={() => setCommandOpen(true)}>
        <Search className="size-[18px]" />
      </IconButton>
      <HelpMenu />
      <Notifications />
      <div className="md:hidden">
        <UserMenu compact />
      </div>
    </header>
  );
}
