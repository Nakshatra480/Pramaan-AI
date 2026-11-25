import { BookOpen, ChartLine, Compass, Cpu, FlaskConical, Globe, Leaf, Sparkles, type LucideIcon } from "lucide-react";
import type { ProjectIcon as IconName } from "@/types";
import { cn } from "@/lib/utils/cn";

export const PROJECT_ICONS: Record<IconName, LucideIcon> = {
  sparkle: Sparkles,
  leaf: Leaf,
  flask: FlaskConical,
  chart: ChartLine,
  book: BookOpen,
  globe: Globe,
  cpu: Cpu,
  compass: Compass,
};

export function ProjectIcon({ icon, size = "md", className }: { icon: IconName; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = PROJECT_ICONS[icon] ?? Sparkles;
  return (
    <span
      className={cn(
        "inline-grid place-items-center shrink-0 border border-line bg-gradient-to-b from-raised to-subtle text-sage-ink",
        size === "sm" && "size-7 rounded-md [&>svg]:size-3.5",
        size === "md" && "size-10 rounded-lg [&>svg]:size-[18px]",
        size === "lg" && "size-14 rounded-xl [&>svg]:size-6",
        className,
      )}
      aria-hidden
    >
      <Icon strokeWidth={1.6} />
    </span>
  );
}
