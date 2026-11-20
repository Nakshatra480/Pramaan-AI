"use client";

import { ChevronsUpDown, CreditCard, LogOut, Moon, Sun, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";
import { cn } from "@/lib/utils/cn";

export function UserMenu({ collapsed, compact }: { collapsed?: boolean; compact?: boolean }) {
  const { user, signOut } = useAuth();
  const { prefs, update } = usePreferences();
  const router = useRouter();
  if (!user) return null;
  const dark = prefs.theme === "dark";

  const trigger =
    compact || collapsed ? (
      <button type="button" aria-label="Account menu" className={cn("grid place-items-center rounded-full", collapsed ? "mx-auto size-10" : "size-9")}>
        <Avatar initials={user.initials} src={user.avatarUrl} size={30} />
      </button>
    ) : (
      <button type="button" className="w-full flex items-center gap-2.5 h-11 px-2 rounded-md hover:bg-subtle transition-colors text-left">
        <Avatar initials={user.initials} src={user.avatarUrl} size={28} />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-medium text-ink truncate">{user.name}</span>
          <span className="block text-[11.5px] text-ink-faint truncate capitalize">{user.plan} plan</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-ink-faint" />
      </button>
    );

  return (
    <Menu
      label="Account"
      placement={compact ? "bottom-end" : "top-start"}
      trigger={trigger}
      items={[
        { heading: user.email },
        { label: "Profile", icon: <User />, onSelect: () => router.push("/settings/profile") },
        { label: "Plan & billing", icon: <CreditCard />, onSelect: () => router.push("/settings/billing") },
        { label: dark ? "Light appearance" : "Dark appearance", icon: dark ? <Sun /> : <Moon />, onSelect: () => update({ theme: dark ? "light" : "dark" }) },
        "separator",
        {
          label: "Sign out",
          icon: <LogOut />,
          onSelect: async () => {
            await signOut();
            // Deterministic destination (the protected-route guard would also redirect here).
            router.replace("/auth/login");
          },
        },
      ]}
    />
  );
}
