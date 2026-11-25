import { Check, Copy, ExternalLink, Globe2, Lock } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import type { Research } from "@/types";

export function ShareDialog({ research, open, onClose }: { research: Research; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [pending, setPending] = useState<Research["visibility"] | null>(null);
  const [copied, setCopied] = useState(false);
  const url = research.shareId && typeof window !== "undefined" ? `${window.location.origin}/shared/${research.shareId}` : "";

  const choose = async (v: Research["visibility"]) => {
    if (v === research.visibility) return;
    setPending(v);
    await services.research.setVisibility(research.id, v);
    setPending(null);
    toast({ title: v === "link" ? "Anyone with the link can view." : "Research is private." });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    toast({ title: "Link copied." });
    setTimeout(() => setCopied(false), 1800);
  };

  const options = [
    { v: "private" as const, icon: Lock, title: "Private", body: "Only you and project members can open this research." },
    { v: "link" as const, icon: Globe2, title: "Anyone with link", body: "Read-only report with citations and source details." },
  ];

  return (
    <Dialog open={open} onClose={onClose} title="Share research" description={research.title}>
      <div role="radiogroup" aria-label="Visibility" className="space-y-2">
        {options.map((o) => {
          const on = research.visibility === o.v;
          return (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(o.v)}
              className={cn("w-full flex items-start gap-3 rounded-xl border p-4 text-left transition-colors", on ? "border-accent bg-sage-soft/60" : "border-line hover:border-line-strong")}
            >
              <span className={cn("grid place-items-center size-9 rounded-lg border", on ? "bg-surface border-sage-deep text-sage-ink" : "border-line text-ink-muted")}>
                <o.icon className="size-4" />
              </span>
              <span className="flex-1">
                <span className="block text-[14px] font-medium text-ink">{o.title}</span>
                <span className="block text-[13px] text-ink-muted mt-0.5">{o.body}</span>
              </span>
              <span className={cn("mt-1 grid place-items-center size-4.5 rounded-full border-[1.5px]", on ? "border-accent" : "border-line-strong")}>
                {on && <span className="size-2 rounded-full bg-accent" />}
                {pending === o.v && <span className="sr-only">Updating</span>}
              </span>
            </button>
          );
        })}
      </div>

      {research.visibility === "link" && url && (
        <div className="mt-5">
          <label htmlFor="share-url" className="text-[12.5px] font-medium text-ink-muted">
            Share link
          </label>
          <div className="mt-1.5 flex gap-2">
            <input id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 h-10 px-3 rounded-md border border-line bg-subtle text-[13px] text-ink-2 outline-none" />
            <Button onClick={copy} variant="primary" leading={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <a href={`/shared/${research.shareId}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
            Preview shared page <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}
    </Dialog>
  );
}
