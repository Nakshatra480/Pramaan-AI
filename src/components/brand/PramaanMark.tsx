import { useId } from "react";
import { cn } from "@/lib/utils/cn";

export type MarkTone = "default" | "onDark" | "onSage" | "mono";

interface PramaanMarkProps {
  size?: number;
  tone?: MarkTone;
  className?: string;
  /** Hide the verification sparkle (e.g. at favicon sizes). */
  sparkle?: boolean;
  title?: string;
}

/**
 * The Pramaan mark: a serif P whose stem becomes a leaf (knowledge / evidence),
 * with a small four-point sparkle (verification).
 */
export function PramaanMark({ size = 32, tone = "default", className, sparkle = true, title }: PramaanMarkProps) {
  const id = useId().replace(/:/g, "");
  const ink = tone === "onDark" || tone === "onSage" ? "#FAF8ED" : tone === "mono" ? "currentColor" : "var(--ink)";
  const leafStops =
    tone === "onDark"
      ? ["#E8EDE3", "#AFC0B0", "#6E8371"]
      : tone === "onSage"
        ? ["#FFFDF7", "#E9EEE5", "#C8D3C6"]
        : ["#2F3D31", "#6F8271", "#C9D2C4"];
  const star = tone === "onDark" ? "#AFC0B0" : tone === "onSage" ? "#FAF8ED" : "#8E9C8F";
  const vein = tone === "onDark" ? "#191A17" : tone === "onSage" ? "#B2BDB3" : "var(--bg)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`leaf-${id}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={leafStops[0]} />
          <stop offset="0.55" stopColor={leafStops[1]} />
          <stop offset="1" stopColor={leafStops[2]} />
        </linearGradient>
      </defs>
      <path
        fill={ink}
        d="M12 8.5H36C49 8.5 56 15.5 56 24.5C56 33.5 49 40.5 36 40.5H30.5V36.5H34.5C41.5 36.5 45.5 31.5 45.5 24.5C45.5 17 41.5 12.5 34.5 12.5H30.5V25.5C27.5 24.2 24.5 24 21 24.6V12.6C18 11.6 15 10.2 12 9.8Z"
      />
      <path
        fill={`url(#leaf-${id})`}
        d="M31 21C35 32 33.5 45 23 56.5C21 58.6 19 59.8 16 61C16.4 51 15.6 41 17.6 32.5C19.4 26 24.5 22 31 21Z"
      />
      <path d="M30 25.5C30.2 37 26.4 48 18 58.6" stroke={vein} strokeWidth="1.1" strokeLinecap="round" opacity="0.85" />
      {sparkle && (
        <path
          fill={star}
          d="M50 43.5C50.45 48.3 51.7 49.55 56.5 50C51.7 50.45 50.45 51.7 50 56.5C49.55 51.7 48.3 50.45 43.5 50C48.3 49.55 49.55 48.3 50 43.5Z"
        />
      )}
    </svg>
  );
}
