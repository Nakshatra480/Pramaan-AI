import { cn } from "@/lib/utils/cn";

/** Small inline spinner for button-level pending states only — never as a page loader. */
export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={cn("animate-spin", className)} aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.6" fill="none" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}
