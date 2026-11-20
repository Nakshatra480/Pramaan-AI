"use client";

import { motion } from "framer-motion";
import { useId, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "md", className }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex p-0.5 rounded-lg bg-subtle border border-line", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex items-center gap-1.5 font-medium transition-colors duration-150 rounded-md touch-target",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
              active ? "text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {active && <motion.span layoutId={`seg-${id}`} transition={spring.snappy} className="absolute inset-0 rounded-md bg-raised shadow-sm border border-line" />}
            <span className="relative inline-flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
