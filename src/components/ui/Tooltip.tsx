import { AnimatePresence, motion } from "framer-motion";
import { cloneElement, isValidElement, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { useAnchoredPosition, type Placement } from "./Popover";
import { Portal } from "./Portal";

type TriggerProps = {
  ref?: React.Ref<HTMLElement> | ((el: HTMLElement | null) => void);
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  "aria-describedby"?: string;
};

export function Tooltip({ content, children, placement = "top", delay = 350, className }: { content: ReactNode; children: ReactElement<TriggerProps>; placement?: Placement; delay?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const { setAnchor, floatRef, pos } = useAnchoredPosition(open, placement, 6);

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  const child = isValidElement(children)
    ? // The timer ref is only touched inside the event handlers below, never during render.
      // eslint-disable-next-line react-hooks/refs
      cloneElement(children, {
        ref: setAnchor,
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
        "aria-describedby": open ? id : undefined,
      })
    : children;

  return (
    <>
      {child}
      <Portal>
        <AnimatePresence>
          {open && (
            <motion.div
              ref={floatRef}
              id={id}
              role="tooltip"
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
              className={cn("z-[var(--z-popover)] pointer-events-none max-w-[240px] rounded-md bg-ink px-2 py-1 text-[12px] text-bg shadow-md", className)}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
