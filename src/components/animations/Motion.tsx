import { motion, type HTMLMotionProps } from "framer-motion";
import { Children, type ReactNode } from "react";
import { ease, spring } from "@/lib/motion";

type Base = HTMLMotionProps<"div"> & { delay?: number; children?: ReactNode };

export function FadeIn({ delay = 0, children, ...props }: Base) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay, ease: ease.out }} {...props}>
      {children}
    </motion.div>
  );
}

export function SlideUp({ delay = 0, children, distance = 12, ...props }: Base & { distance?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: distance }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay, ease: ease.out }} {...props}>
      {children}
    </motion.div>
  );
}

export function ScaleIn({ delay = 0, children, ...props }: Base) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.gentle, delay }} {...props}>
      {children}
    </motion.div>
  );
}

/** Reveals on scroll into view — for marketing sections. */
export function Reveal({ delay = 0, children, ...props }: Base) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: ease.out }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Staggers direct children. Each child is wrapped in a motion item. */
export function Stagger({ children, stagger = 0.05, delay = 0, className, itemClassName, as = "div" }: { children: ReactNode; stagger?: number; delay?: number; className?: string; itemClassName?: string; as?: "div" | "ul" | "ol" }) {
  const Comp = as === "ul" ? motion.ul : as === "ol" ? motion.ol : motion.div;
  const Item = as === "div" ? motion.div : motion.li;
  return (
    <Comp className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: stagger, delayChildren: delay } } }}>
      {Children.map(children, (child) =>
        child == null || child === false ? null : (
          <Item className={itemClassName} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: ease.out } } }}>
            {child}
          </Item>
        ),
      )}
    </Comp>
  );
}
