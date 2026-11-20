"use client";

import { motion } from "framer-motion";
import { Bell, Brain, CreditCard, LayoutGrid, Palette, Search, Shield, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";

export const SETTINGS_NAV = [
  { href: "/settings", label: "Overview", icon: LayoutGrid, description: "" },
  { href: "/settings/profile", label: "Profile", icon: User, description: "Name, email and avatar" },
  { href: "/settings/research", label: "Research", icon: Search, description: "Default depth, sources and citations" },
  { href: "/settings/ai", label: "AI", icon: Brain, description: "How models are used" },
  { href: "/settings/appearance", label: "Appearance", icon: Palette, description: "Theme and motion" },
  { href: "/settings/notifications", label: "Notifications", icon: Bell, description: "What Pramaan tells you about" },
  { href: "/settings/privacy", label: "Privacy", icon: Shield, description: "Retention, export and deletion" },
  { href: "/settings/billing", label: "Billing", icon: CreditCard, description: "Plan and usage" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings">
      <ul className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 border-b border-line lg:border-0 pb-2 lg:pb-0">
        {SETTINGS_NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <li key={n.href} className="shrink-0">
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex items-center gap-2.5 h-9 px-3 rounded-md text-[13.5px] font-medium transition-colors whitespace-nowrap", active ? "text-ink" : "text-ink-muted hover:text-ink")}
              >
                {active && <motion.span layoutId="settings-active" transition={spring.snappy} className="absolute inset-0 rounded-md bg-raised border border-line shadow-xs" />}
                <n.icon className="relative size-4" />
                <span className="relative">{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
