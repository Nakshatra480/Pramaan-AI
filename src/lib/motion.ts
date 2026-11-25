/** Motion tokens (PRD §53). Durations in seconds for Framer Motion. */
export const duration = { fast: 0.18, normal: 0.3, slow: 0.6 } as const;

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const spring = {
  /** Panels, drawers, modals. */
  gentle: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const,
  /** Small UI: tabs, toggles, indicators. */
  snappy: { type: "spring", stiffness: 420, damping: 34 } as const,
  /** Layout changes. */
  layout: { type: "spring", stiffness: 320, damping: 32 } as const,
};

export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
};
