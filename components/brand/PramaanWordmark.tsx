import { cn } from "@/lib/utils/cn";

interface PramaanWordmarkProps {
  className?: string;
  tagline?: boolean;
  tone?: "default" | "onDark";
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZES = {
  sm: { word: "text-[19px]", tag: "text-[7.5px] tracking-[0.28em] mt-0.5" },
  md: { word: "text-[24px]", tag: "text-[8.5px] tracking-[0.3em] mt-1" },
  lg: { word: "text-[40px]", tag: "text-[11px] tracking-[0.34em] mt-1.5" },
  xl: { word: "text-[64px] sm:text-[88px]", tag: "text-[12px] sm:text-[15px] tracking-[0.38em] mt-3" },
};

export function PramaanWordmark({ className, tagline = false, tone = "default", size = "md" }: PramaanWordmarkProps) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex flex-col leading-none", className)}>
      <span className={cn("font-display whitespace-nowrap leading-none", s.word, tone === "onDark" ? "text-ivory" : "text-ink")}>
        Pramaan{" "}
        <span className={tone === "onDark" ? "text-[#AFC0B0]" : "text-[#5A6D5E] dark:text-sage-ink"}>AI</span>
      </span>
      {tagline && (
        <span className={cn("font-sans uppercase font-medium", s.tag, tone === "onDark" ? "text-ivory/60" : "text-ink-muted")}>
          Research, with evidence.
        </span>
      )}
    </span>
  );
}
