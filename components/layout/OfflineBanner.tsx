"use client";

import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Network unavailable state. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          role="status"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden bg-warn-soft text-warn border-b border-line"
        >
          <p className="flex items-center justify-center gap-2 py-2 px-4 text-[13px]">
            <WifiOff className="size-4" />
            You&rsquo;re offline. Research in progress will resume when your connection returns.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
