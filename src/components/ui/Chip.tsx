import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface ChipProps {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Toggleable pill, used for source channels, interests and filters. */
export function Chip({ selected, onToggle, children, icon, disabled, className }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]",
        selected ? "bg-sage-soft border-sage-deep text-sage-ink" : "bg-raised border-line text-ink-muted hover:text-ink hover:border-line-strong",
        disabled && "opacity-45 pointer-events-none",
        className,
      )}
    >
      {selected ? <Check className="size-3.5" aria-hidden /> : icon}
      {children}
    </button>
  );
}
