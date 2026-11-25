import { cn } from "@/lib/utils/cn";
import { PramaanMark } from "./PramaanMark";
import { PramaanWordmark } from "./PramaanWordmark";

interface PramaanLogoProps {
  variant?: "full" | "compact" | "mark";
  tone?: "default" | "onDark";
  tagline?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const MARK = { sm: 26, md: 32, lg: 52 };

/** Horizontal logo: mark + wordmark. `compact` is used in the sidebar, `mark` when collapsed. */
export function PramaanLogo({ variant = "full", tone = "default", tagline = false, size = "md", className }: PramaanLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label="Pramaan AI">
      <PramaanMark size={MARK[size]} tone={tone === "onDark" ? "onDark" : "default"} />
      {variant !== "mark" && (
        <PramaanWordmark size={variant === "compact" ? "sm" : size} tagline={tagline && variant === "full"} tone={tone} />
      )}
    </span>
  );
}
