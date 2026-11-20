"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Portal } from "@/components/ui/Portal";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";

type ToastTone = "success" | "info" | "error";

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id" | "tone"> & { tone?: ToastTone; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const toast = useCallback<ToastContextValue["toast"]>(
    ({ duration = 3600, tone = "success", ...t }) => {
      const id = ++counter;
      setToasts((ts) => [...ts.slice(-2), { ...t, tone, id }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Portal>
        <div
          aria-live="polite"
          aria-relevant="additions"
          className="fixed z-[var(--z-toast)] bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 flex flex-col items-center md:items-end gap-2 w-[calc(100%-32px)] max-w-[380px] pointer-events-none"
        >
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.16 } }}
                transition={spring.gentle}
                role="status"
                className="pointer-events-auto w-full flex items-start gap-3 rounded-xl bg-ink text-bg shadow-lg pl-3.5 pr-2 py-3"
              >
                <span
                  className={cn(
                    "mt-px grid place-items-center size-5 rounded-full shrink-0",
                    t.tone === "success" && "bg-[#8FA392] text-[#191A17]",
                    t.tone === "info" && "bg-bg/15 text-bg",
                    t.tone === "error" && "bg-[#E0907F] text-[#191A17]",
                  )}
                >
                  {t.tone === "success" ? <Check className="size-3" strokeWidth={3} /> : t.tone === "error" ? <AlertCircle className="size-3" strokeWidth={2.6} /> : <Info className="size-3" strokeWidth={2.6} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium leading-5">{t.title}</p>
                  {t.description && <p className="text-[12.5px] text-bg/65 mt-0.5">{t.description}</p>}
                </div>
                {t.action && (
                  <button
                    type="button"
                    className="text-[12.5px] font-medium text-[#CBD6CA] hover:text-bg px-1.5 h-6 rounded"
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
                <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="grid place-items-center size-6 rounded text-bg/50 hover:text-bg">
                  <X className="size-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}
