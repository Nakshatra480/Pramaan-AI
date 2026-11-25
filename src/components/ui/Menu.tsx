import { useRef, type KeyboardEvent, type ReactElement, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils/cn";
import { Popover, type Placement } from "./Popover";

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  description?: ReactNode;
}

export type MenuEntry = MenuItem | "separator" | { heading: string };

interface MenuProps {
  trigger: ReactElement<{ ref?: Ref<HTMLElement>; onClick?: (e: React.MouseEvent) => void }>;
  items: MenuEntry[];
  placement?: Placement;
  label: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Dropdown menu with arrow-key navigation. */
export function Menu({ trigger, items, placement = "bottom-end", label, className, open, onOpenChange }: MenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    const els = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])") ?? [])];
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      els[els.length - 1]?.focus();
    }
  };

  return (
    <Popover trigger={trigger} placement={placement} label={label} open={open} onOpenChange={onOpenChange} className={cn("p-1.5 min-w-[220px]", className)}>
      {(close) => (
        <div
          ref={(el) => {
            listRef.current = el;
            el?.querySelector<HTMLButtonElement>("[role=menuitem]:not([disabled])")?.focus({ preventScroll: true });
          }}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
        >
          {items.map((item, i) => {
            if (item === "separator") return <div key={i} role="separator" className="my-1.5 h-px bg-line" />;
            if ("heading" in item)
              return (
                <div key={i} className="px-2.5 pt-2 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                  {item.heading}
                </div>
              );
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect?.();
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-[13.5px] outline-none transition-colors",
                  "hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none disabled:opacity-40",
                  item.tone === "danger" ? "text-danger" : "text-ink-2",
                )}
              >
                {item.icon && <span className={cn("shrink-0 [&>svg]:size-4", item.tone === "danger" ? "text-danger" : "text-ink-muted")}>{item.icon}</span>}
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{item.label}</span>
                  {item.description && <span className="block text-[12px] text-ink-faint truncate">{item.description}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
