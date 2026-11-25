import { cn } from "@/lib/utils/cn";

export function Separator({ className, orientation = "horizontal" }: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn("bg-line shrink-0", orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch", className)}
    />
  );
}
