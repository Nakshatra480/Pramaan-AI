import { cn } from "@/lib/utils/cn";

const TONES = ["bg-sage text-sage-ink", "bg-cream text-[#4b4a3f]", "bg-stone/60 text-[#3f3d33]", "bg-sage-deep/70 text-sage-ink"];

export function Avatar({ initials, src, size = 32, className, label }: { initials: string; src?: string; size?: number; className?: string; label?: string }) {
  const tone = TONES[(initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % TONES.length];
  return (
    <span
      className={cn("inline-grid place-items-center rounded-full font-medium shrink-0 overflow-hidden ring-2 ring-bg", tone, className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

export function AvatarStack({ people, max = 3, size = 24 }: { people: { initials: string; name: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="inline-flex -space-x-1.5" aria-label={people.map((p) => p.name).join(", ")}>
      {shown.map((p) => (
        <Avatar key={p.name} initials={p.initials} size={size} />
      ))}
      {people.length > max && (
        <span className="inline-grid place-items-center rounded-full bg-subtle text-ink-muted ring-2 ring-bg text-[10px]" style={{ width: size, height: size }}>
          +{people.length - max}
        </span>
      )}
    </span>
  );
}
