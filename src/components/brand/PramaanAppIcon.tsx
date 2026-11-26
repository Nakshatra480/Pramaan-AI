import { cn } from "@/lib/utils/cn";
import { PramaanMark } from "./PramaanMark";

type Variant = "ivory" | "sage" | "forest" | "ink";

const BG: Record<Variant, string> = {
  ivory: "bg-gradient-to-b from-[#FFFDF7] to-[#F1EEDF] ring-1 ring-black/5",
  sage: "bg-gradient-to-b from-[#B9C5B8] to-[#9DAB9E]",
  forest: "bg-gradient-to-b from-[#34453A] to-[#1F2A22]",
  ink: "bg-[#191A17]",
};

/** App-icon treatment (rounded square, soft depth). */
export function PramaanAppIcon({ variant = "ivory", size = 64, className }: { variant?: Variant; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-grid place-items-center shadow-md", BG[variant], className)}
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
    >
      <PramaanMark size={size * 0.62} tone={variant === "ivory" ? "default" : variant === "sage" ? "onSage" : "onDark"} sparkle={size >= 40} />
    </span>
  );
}
