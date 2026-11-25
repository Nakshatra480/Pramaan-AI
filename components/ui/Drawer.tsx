import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { useFocusTrap, useLockScroll } from "@/lib/hooks/use-focus-trap";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "./IconButton";
import { Portal } from "./Portal";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** `right` panel on desktop, `bottom` sheet on mobile, `left` for navigation. */
  side?: "right" | "left" | "bottom";
  children: ReactNode;
  className?: string;
  headerExtra?: ReactNode;
  hideTitle?: boolean;
}

export function Drawer(props: DrawerProps) {
  return (
    <Portal>
      <AnimatePresence>{props.open && <DrawerInner {...props} />}</AnimatePresence>
    </Portal>
  );
}

function DrawerInner({ onClose, title, side = "right", children, className, headerExtra, hideTitle }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocusTrap(ref, true, onClose);
  useLockScroll(true);

  const variants = {
    right: { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } },
    left: { initial: { x: "-100%" }, animate: { x: 0 }, exit: { x: "-100%" } },
    bottom: { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } },
  }[side];

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return (
    <div className="fixed inset-0 z-[var(--z-drawer)]">
      <motion.div className="absolute inset-0 bg-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} aria-hidden />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        {...variants}
        transition={spring.gentle}
        drag={side === "bottom" ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={side === "bottom" ? onDragEnd : undefined}
        className={cn(
          "absolute bg-surface shadow-lg outline-none flex flex-col",
          side === "right" && "right-0 inset-y-0 w-full max-w-[440px] border-l border-line",
          side === "left" && "left-0 inset-y-0 w-[300px] max-w-[85vw] border-r border-line",
          side === "bottom" && "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t border-line",
          className,
        )}
      >
        {side === "bottom" && <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-line-strong" aria-hidden />}
        <div className={cn("flex items-center justify-between gap-3 px-5 shrink-0", side === "bottom" ? "py-2" : "h-14 border-b border-line")}>
          <h2 id={`${id}-title`} className={cn("text-[14px] font-medium text-ink", hideTitle && "sr-only")}>
            {title}
          </h2>
          <div className="flex items-center gap-1 ml-auto">
            {headerExtra}
            <IconButton label="Close" size="sm" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto thin-scrollbar overscroll-contain">{children}</div>
      </motion.div>
    </div>
  );
}
