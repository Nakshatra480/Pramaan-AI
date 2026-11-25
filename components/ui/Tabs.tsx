import { motion } from "framer-motion";
import { Link } from "@/components/ui/Link";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  count?: number;
  href?: string;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange?: (v: T) => void;
  label: string;
  className?: string;
}

/** Underline tabs with an animated indicator. Renders links when items carry `href`. */
export function Tabs<T extends string>({ items, value, onChange, label, className }: TabsProps<T>) {
  const id = useId();
  const refs = useRef<(HTMLElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    refs.current[next]?.focus();
    if (!items[next].href) onChange?.(items[next].value);
  };

  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 border-b border-line overflow-x-auto no-scrollbar", className)}>
      {items.map((item, i) => {
        const active = item.value === value;
        const cls = cn(
          "relative inline-flex items-center gap-1.5 h-10 px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors duration-150 rounded-t-md",
          active ? "text-ink" : "text-ink-muted hover:text-ink",
        );
        const inner = (
          <>
            {item.label}
            {item.count !== undefined && <span className="text-[11.5px] text-ink-faint tabular">{item.count}</span>}
            {active && <motion.span layoutId={`tab-${id}`} transition={spring.snappy} className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-ink" />}
          </>
        );
        return item.href ? (
          <Link
            key={item.value}
            href={item.href}
            role="tab"
            aria-selected={active}
            ref={(el) => {
              refs.current[i] = el;
            }}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cls}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            ref={(el) => {
              refs.current[i] = el;
            }}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onChange?.(item.value)}
            className={cls}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
