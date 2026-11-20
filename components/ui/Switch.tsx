"use client";

import { motion } from "framer-motion";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled, hideLabel }: SwitchProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200",
        checked ? "bg-accent" : "bg-line-strong",
        disabled && "opacity-50",
      )}
    >
      <motion.span layout transition={spring.snappy} className={cn("block size-4 rounded-full bg-raised shadow-sm", checked && "ml-auto")} />
    </button>
  );
  if (hideLabel) return control;
  return (
    <label className="flex items-start justify-between gap-6 cursor-pointer">
      <span>
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {description && <span className="block text-[13px] text-ink-muted mt-0.5">{description}</span>}
      </span>
      {control}
    </label>
  );
}
