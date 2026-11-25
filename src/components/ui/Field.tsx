import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const control =
  "w-full bg-raised border border-line rounded-md text-[14px] text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] duration-150 outline-none hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-sage/50 disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger-soft";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode }>(function Input(
  { className, leading, ...props },
  ref,
) {
  if (!leading) return <input ref={ref} className={cn(control, "h-10 px-3", className)} {...props} />;
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">{leading}</span>
      <input ref={ref} className={cn(control, "h-10 pl-9 pr-3", className)} {...props} />
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, "px-3 py-2.5 leading-relaxed resize-none", className)} {...props} />;
});

/** `containerClassName` sizes the control (width), so the chevron always sits inside the select (audit L-12). */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { containerClassName?: string }>(function Select(
  { className, containerClassName, children, ...props },
  ref,
) {
  return (
    <div className={cn("relative", containerClassName)}>
      <select ref={ref} className={cn(control, "h-10 pl-3 pr-9 appearance-none cursor-pointer", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-ink-faint pointer-events-none" aria-hidden />
    </div>
  );
});

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
  className?: string;
  trailing?: ReactNode;
}

/** Label + control + hint/error with correct ARIA wiring. */
export function Field({ label, hint, error, children, className, trailing }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
        {trailing}
      </div>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} className="text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
