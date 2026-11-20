import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "outline" | "solid";
  active?: boolean;
}

const SIZE = { sm: "size-7 rounded-sm touch-target", md: "size-9 rounded-md touch-target", lg: "size-10 rounded-lg" };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", variant = "ghost", active, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid place-items-center shrink-0 text-ink-muted transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
        "hover:text-ink disabled:opacity-40 disabled:pointer-events-none",
        variant === "ghost" && "hover:bg-subtle",
        variant === "outline" && "border border-line bg-raised hover:border-line-strong",
        variant === "solid" && "bg-ink text-bg hover:bg-ink-2 hover:text-bg",
        active && "bg-subtle text-ink",
        SIZE[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
