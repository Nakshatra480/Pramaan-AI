"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { useFocusTrap, useLockScroll } from "@/lib/hooks/use-focus-trap";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "./IconButton";
import { Portal } from "./Portal";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  hideHeader?: boolean;
  className?: string;
}

const WIDTH = { sm: "max-w-[400px]", md: "max-w-[520px]", lg: "max-w-[680px]" };

export function Dialog({ open, onClose, title, description, children, footer, size = "md", hideHeader, className }: DialogProps) {
  return (
    <Portal>
      <AnimatePresence>{open && <DialogInner {...{ onClose, title, description, footer, size, hideHeader, className }}>{children}</DialogInner>}</AnimatePresence>
    </Portal>
  );
}

function DialogInner({ onClose, title, description, children, footer, size = "md", hideHeader, className }: Omit<DialogProps, "open">) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocusTrap(ref, true, onClose);
  useLockScroll(true);
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-end sm:place-items-center sm:p-6">
      <motion.div
        className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.985, transition: { duration: 0.16 } }}
        transition={spring.gentle}
        className={cn(
          "relative w-full bg-surface border border-line shadow-lg outline-none",
          "rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto thin-scrollbar",
          WIDTH[size],
          className,
        )}
      >
        {!hideHeader ? (
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div>
              <h2 id={`${id}-title`} className="font-display text-[26px] text-ink">
                {title}
              </h2>
              {description && (
                <p id={`${id}-desc`} className="mt-1.5 text-[14px] text-ink-muted">
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
              <X className="size-4" />
            </IconButton>
          </div>
        ) : (
          <h2 id={`${id}-title`} className="sr-only">
            {title}
          </h2>
        )}
        <div className={cn(!hideHeader && "px-6 pt-5 pb-6")}>{children}</div>
        {footer && <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 px-6 py-4 border-t border-line bg-subtle/40 rounded-b-2xl">{footer}</div>}
      </motion.div>
    </div>
  );
}
