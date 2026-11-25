import { BookOpen, FolderClosed, History, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

export const NAV: NavItem[] = [
  { href: "/projects", label: "Projects", icon: FolderClosed, match: (p) => p.startsWith("/projects") },
  { href: "/library", label: "Library", icon: BookOpen, match: (p) => p.startsWith("/library") },
  { href: "/history", label: "History", icon: History, match: (p) => p.startsWith("/history") },
];

export function pageTitle(path: string): string {
  if (path.startsWith("/research/new")) return "New research";
  if (path.startsWith("/research/")) return "Research";
  if (path.startsWith("/projects")) return "Projects";
  if (path.startsWith("/library")) return "Library";
  if (path.startsWith("/history")) return "History";
  if (path.startsWith("/settings")) return "Settings";
  return "Pramaan";
}
