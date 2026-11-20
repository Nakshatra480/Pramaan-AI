"use client";

import { AnimatePresence, motion } from "framer-motion";
import { cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils/cn";
import { Portal } from "./Portal";


export type Placement = "bottom-start" | "bottom-end" | "bottom" | "top" | "top-start" | "top-end";

/** Positions a floating element relative to an anchor and keeps it within the viewport. */
export function useAnchoredPosition(open: boolean, placement: Placement, gap = 8) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const floatRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; placement: Placement } | null>(null);

  const update = useCallback(() => {
    const a = anchor?.getBoundingClientRect();
    const f = floatRef.current;
    if (!a || !f) return;
    const fw = f.offsetWidth;
    const fh = f.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let p = placement;
    if (p.startsWith("bottom") && a.bottom + gap + fh > vh - 8 && a.top - gap - fh > 8) p = p.replace("bottom", "top") as Placement;
    if (p.startsWith("top") && a.top - gap - fh < 8) p = p.replace("top", "bottom") as Placement;
    const top = p.startsWith("bottom") ? a.bottom + gap : a.top - gap - fh;
    let left = p.endsWith("start") ? a.left : p.endsWith("end") ? a.right - fw : a.left + a.width / 2 - fw / 2;
    left = Math.max(8, Math.min(left, vw - fw - 8));
    setPos({ top, left, placement: p });
  }, [placement, gap, anchor]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update]);

  return { anchor, setAnchor, floatRef, pos };
}

interface PopoverProps {
  trigger: ReactElement<{ ref?: Ref<HTMLElement>; onClick?: (e: React.MouseEvent) => void; "aria-expanded"?: boolean; "aria-haspopup"?: string }>;
  children: ReactNode | ((close: () => void) => ReactNode);
  placement?: Placement;
  className?: string;
  label?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({ trigger, children, placement = "bottom-start", className, label, open: controlled, onOpenChange }: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlled ?? uncontrolled;
  const setOpen = useCallback(
    (v: boolean) => {
      setUncontrolled(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  const { anchor, setAnchor, floatRef, pos } = useAnchoredPosition(open, placement);
  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (floatRef.current?.contains(t) || anchor?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        anchor?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, anchor, floatRef]);

  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger, {
        ref: setAnchor,
        onClick: (e: React.MouseEvent) => {
          trigger.props.onClick?.(e);
          setOpen(!open);
        },
        "aria-expanded": open,
        "aria-haspopup": "dialog",
      })
    : trigger;

  return (
    <>
      {triggerEl}
      <Portal>
        <AnimatePresence>
          {open && (
            <motion.div
              ref={floatRef}
              role="dialog"
              aria-label={label}
              initial={{ opacity: 0, scale: 0.97, y: pos?.placement.startsWith("top") ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
              className={cn(
                "z-[var(--z-popover)] min-w-[200px] rounded-xl border border-line bg-raised shadow-lg",
                pos?.placement.endsWith("end") ? "origin-top-right" : "origin-top-left",
                className,
              )}
            >
              {typeof children === "function" ? children(close) : children}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
