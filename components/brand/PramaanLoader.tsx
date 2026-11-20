import { cn } from "@/lib/utils/cn";
import { PramaanMark } from "./PramaanMark";

/**
 * Branded loading indicator: the Pramaan mark breathing gently inside a slowly sweeping sage arc,
 * over a soft halo. Pure CSS (works in server components; stops under reduced motion — both the OS
 * setting and the in-app one, via the global reduced-motion rule).
 */
export function PramaanLoader({ size = 72, label = "Loading", className }: { size?: number; label?: string; className?: string }) {
  const mark = Math.round(size * 0.46);
  return (
    <span role="img" aria-label={label} className={cn("pramaan-loader relative inline-grid place-items-center shrink-0", className)} style={{ width: size, height: size }}>
      <span aria-hidden className="pramaan-loader-halo absolute inset-[14%] rounded-full bg-sage-soft" />
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full">
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--line)" strokeWidth="1.5" />
        <circle
          className="pramaan-loader-arc"
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="var(--sage-ink)"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="22 78"
        />
      </svg>
      <span aria-hidden className="pramaan-loader-mark relative">
        <PramaanMark size={mark} />
      </span>
    </span>
  );
}
