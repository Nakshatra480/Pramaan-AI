"use client";

import { motion } from "framer-motion";
import { ArrowRight, Menu as MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PramaanLogo } from "@/components/brand/PramaanLogo";
import { useAuth } from "@/components/providers/AuthProvider";
import { ButtonLink } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils/cn";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/#why", label: "Why Pramaan" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#report", label: "The result" },
  { href: "/#evidence", label: "Evidence" },
  { href: "/#sources", label: "Sources" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#trust", label: "Trust" },
];

export function MarketingHeader() {
  const pathname = usePathname();
  const { status } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const authed = status === "authenticated";

  // Home and the logo go to the very top (not to the hero's anchor, which sits below the sticky header).
  const toTop = (e: React.MouseEvent) => {
    setOpen(false);
    if (pathname !== "/") return;
    e.preventDefault();
    window.history.replaceState(null, "", "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className={cn("sticky top-0 z-[var(--z-sticky)] transition-[background-color,border-color] duration-300 border-b", scrolled ? "bg-bg/85 backdrop-blur-md border-line/70" : "bg-transparent border-transparent")}>
      <div className="mx-auto max-w-[1200px] h-16 px-4 sm:px-8 flex items-center gap-8">
        <Link href="/" onClick={toTop} aria-label="Pramaan AI home" className="rounded-md">
          <PramaanLogo variant="compact" size="sm" />
        </Link>
        <nav aria-label="Main" className="hidden xl:flex items-center gap-0.5">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={l.href === "/" ? toTop : undefined} className={cn("h-9 px-2.5 inline-flex items-center rounded-md text-[13.5px] whitespace-nowrap transition-colors", "text-ink-muted hover:text-ink")}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {/* /app is the real workspace; signed-out visitors are sent to sign in by its route guard.
              Hidden via a wrapper: ButtonLink's own `inline-flex` overrides a `hidden` class passed to it. */}
          <span className="hidden sm:flex items-center gap-2">
            {!authed && (
              <ButtonLink href="/auth/login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
            )}
            <ButtonLink href="/app" size="sm" trailing={<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />} className="group">
              Open Pramaan
            </ButtonLink>
          </span>
          <IconButton label="Open menu" className="xl:hidden" onClick={() => setOpen(true)}>
            <MenuIcon className="size-5" />
          </IconButton>
        </div>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} side="right" title="Menu">
        <nav aria-label="Mobile" className="p-4 flex flex-col">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={l.href === "/" ? toTop : () => setOpen(false)} className="py-3 font-display text-[28px] text-ink border-b border-line">
              {l.label}
            </Link>
          ))}
          <ButtonLink href="/auth/signup" className="mt-6" onClick={() => setOpen(false)}>
            Start researching
          </ButtonLink>
          <ButtonLink href="/auth/login" variant="secondary" className="mt-2" onClick={() => setOpen(false)}>
            Sign in
          </ButtonLink>
        </nav>
      </Drawer>
    </motion.header>
  );
}
