"use client";

import type { ReactNode } from "react";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import { cn } from "@/lib/utils/cn";
import { CommandPalette } from "./CommandPalette";
import { MobileNavigation } from "./MobileNavigation";
import { OfflineBanner } from "./OfflineBanner";
import { ProtectedRoute } from "./ProtectedRoute";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useWorkspace, WorkspaceProvider } from "./WorkspaceContext";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <WorkspaceProvider>
        <ShellFrame>{children}</ShellFrame>
        <CommandPalette />
        <CreateProjectModal />
      </WorkspaceProvider>
    </ProtectedRoute>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const { sidebarCollapsed } = useWorkspace();
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className={cn("transition-[padding] duration-300 ease-out md:pl-[72px]", sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-[264px]")}>
        <TopBar />
        <OfflineBanner />
        <main id="main" className="pb-24 md:pb-0 min-w-0">
          {children}
        </main>
      </div>
      <MobileNavigation />
    </div>
  );
}
