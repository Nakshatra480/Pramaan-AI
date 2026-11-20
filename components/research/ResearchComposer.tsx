"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, ChevronDown, FolderClosed, Gauge, Layers, Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Menu } from "@/components/ui/Menu";
import { Popover } from "@/components/ui/Popover";
import { Spinner } from "@/components/ui/Spinner";
import { useResource } from "@/lib/hooks/use-resource";
import { track } from "@/lib/firebase/analytics";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import { rejectionMessage, splitUploads, UPLOAD_ACCEPT } from "@/lib/utils/uploads";
import type { ResearchMode, SourceChannel } from "@/types";
import { CHANNELS, MODES } from "./research-options";

interface ResearchComposerProps {
  placeholder?: string;
  initialQuery?: string;
  /** Lock research to a project (project workspace). */
  projectId?: string | null;
  lockProject?: boolean;
  size?: "hero" | "default";
  autoFocus?: boolean;
  className?: string;
  footerNote?: React.ReactNode;
  /** Controlled settings — lets a page render its own mode/source pickers. */
  settings?: ComposerSettings;
  onSettingsChange?: (s: ComposerSettings) => void;
  hideControls?: boolean;
}

export interface ComposerSettings {
  mode: ResearchMode;
  channels: SourceChannel[];
  projectId: string | null;
}

/**
 * The research composer. Collects question, mode, sources and project, then
 * creates a research session through the service layer and routes to it.
 */
export function ResearchComposer({
  placeholder = "Ask Pramaan anything…",
  initialQuery = "",
  projectId: initialProject = null,
  lockProject = false,
  size = "default",
  autoFocus,
  className,
  footerNote,
  settings,
  onSettingsChange,
  hideControls,
}: ResearchComposerProps) {
  const router = useRouter();
  const toast = useToast();
  const { prefs } = usePreferences();
  const [query, setQuery] = useState(initialQuery);
  const [ownMode, setOwnMode] = useState<ResearchMode>(prefs.defaultMode);
  const [ownChannels, setOwnChannels] = useState<SourceChannel[]>(() => withProject(prefs.defaultChannels, initialProject));
  const [ownProject, setOwnProject] = useState<string | null>(initialProject);
  const mode = settings?.mode ?? ownMode;
  const channels = settings?.channels ?? ownChannels;
  const projectId = settings ? settings.projectId : ownProject;
  const current = { mode, channels, projectId };
  const setMode = (m: ResearchMode) => (settings ? onSettingsChange?.({ ...current, mode: m }) : setOwnMode(m));
  const setChannels = (fn: (cs: SourceChannel[]) => SourceChannel[]) => (settings ? onSettingsChange?.({ ...current, channels: fn(channels) }) : setOwnChannels(fn));
  const setProjectId = (id: string | null) => (settings ? onSettingsChange?.({ ...current, projectId: id, channels: withProject(channels, id) }) : setOwnProject(id));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: projects } = useResource(() => services.projects.list(), []);
  const project = projects?.find((p) => p.id === projectId);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [query]);

  // Keep defaults in sync once preferences hydrate.
  useEffect(() => {
    setOwnMode(prefs.defaultMode);
    setOwnChannels(withProject(prefs.defaultChannels, initialProject));
  }, [prefs.defaultMode, prefs.defaultChannels, initialProject]);

  // Attached files are uploaded to the library right away and must finish indexing before the
  // research starts, so they are actually used as evidence (audit: attachments were discarded).
  const pending = attachments.some((a) => a.status === "uploading" || a.status === "processing");
  useEffect(() => {
    const ids = attachments.filter((a) => a.status === "processing" && a.id).map((a) => a.id!);
    if (!ids.length) return;
    const t = setTimeout(async () => {
      const docs = await Promise.all(ids.map((id) => services.library.get(id).catch(() => null)));
      setAttachments((xs) =>
        xs.map((a) => {
          const d = docs.find((x) => x?.id === a.id);
          if (!d) return a;
          if (d.status === "ready") return { ...a, status: "ready" };
          if (d.status === "failed") return { ...a, status: "failed", message: d.error ?? "Couldn't be indexed." };
          return a;
        }),
      );
    }, 2000);
    return () => clearTimeout(t);
  }, [attachments]);

  const attach = async (files: File[]) => {
    const { ok, rejected } = splitUploads(files);
    if (rejected.length) toast({ title: `${rejected.length} file${rejected.length > 1 ? "s" : ""} skipped`, description: rejectionMessage(rejected), tone: "error" });
    if (!ok.length) return;
    if (!projectId && !channels.includes("library")) setChannels((cs) => [...cs, "library"]);
    const added = ok.map((f) => ({ key: `${f.name}:${f.size}:${Date.now()}`, name: f.name, status: "uploading" as const }));
    setAttachments((xs) => [...xs, ...added]);
    await Promise.all(
      ok.map(async (f, i) => {
        const key = added[i].key;
        try {
          const [doc] = await services.library.upload([f], { projectId: projectId ?? undefined });
          const status: Attachment["status"] = doc.status === "ready" ? "ready" : doc.status === "failed" ? "failed" : "processing";
          setAttachments((xs) => xs.map((a) => (a.key === key ? { ...a, id: doc.id, status, duplicate: doc.duplicate, message: doc.error } : a)));
        } catch (e) {
          setAttachments((xs) => xs.map((a) => (a.key === key ? { ...a, status: "failed", message: e instanceof Error ? e.message : "Upload failed." } : a)));
        }
      }),
    );
  };

  const toggleChannel = (c: SourceChannel) => setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  const submit = async () => {
    const q = query.trim();
    if (q.length < 8) {
      setError("Ask a complete question so Pramaan can plan the research.");
      ref.current?.focus();
      return;
    }
    if (q.length > MAX_QUERY) {
      setError(`Keep your question under ${MAX_QUERY.toLocaleString()} characters — it's ${q.length.toLocaleString()} now. Put long background in project instructions or an uploaded document.`);
      ref.current?.focus();
      return;
    }
    if (pending) {
      setError("Wait for your attached files to finish indexing.");
      return;
    }
    if (!channels.length) {
      setError("Select at least one source.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const r = await services.research.create({ query: q, mode, channels, projectId });
      void track("research_started", { mode, in_project: Boolean(projectId) });
      router.push(`/research/${r.id}`);
    } catch (e) {
      setSubmitting(false);
      const message = e instanceof Error ? e.message : "Please try again.";
      if ((e as { code?: string }).code === "VALIDATION_FAILED") setError(message);
      else toast({ title: "Couldn't start research", description: message, tone: "error" });
    }
  };

  const modeDef = MODES.find((m) => m.value === mode)!;
  const nearLimit = query.trim().length > MAX_QUERY * 0.8;
  const overLimit = query.trim().length > MAX_QUERY;
  const hero = size === "hero";

  return (
    <form
      className={cn("group relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div
        className={cn(
          "rounded-2xl border bg-raised shadow-sm transition-[border-color,box-shadow] duration-200",
          "focus-within:border-line-strong focus-within:shadow-md",
          error ? "border-danger/60" : "border-line",
        )}
      >
        <label htmlFor="composer" className="sr-only">
          Research question
        </label>
        <textarea
          id="composer"
          ref={ref}
          value={query}
          autoFocus={autoFocus}
          rows={hero ? 2 : 1}
          onChange={(e) => {
            setQuery(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "composer-error" : nearLimit ? "composer-count" : undefined}
          className={cn(
            "block w-full resize-none bg-transparent outline-none focus-visible:outline-none text-ink placeholder:text-ink-faint",
            hero ? "px-5 pt-5 pb-2 text-[17px] sm:text-[18px] leading-relaxed min-h-[84px]" : "px-4 pt-4 pb-1 text-[15.5px] leading-relaxed min-h-[56px]",
          )}
        />

        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex flex-wrap gap-1.5 px-4 pb-1 overflow-hidden">
              {attachments.map((a) => (
                <li
                  key={a.key}
                  className={cn("inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-md border text-[12.5px]", a.status === "failed" ? "bg-danger-soft border-danger/30 text-danger" : "bg-subtle border-line text-ink-2")}
                  title={a.message}
                >
                  {a.status === "uploading" || a.status === "processing" ? <Spinner className="size-3" /> : a.status === "ready" ? <Check className="size-3 text-accent" /> : <Paperclip className="size-3" />}
                  <span className="max-w-[180px] truncate">{a.name}</span>
                  <span className="text-[11.5px] text-ink-muted">
                    {a.status === "uploading" ? "Uploading" : a.status === "processing" ? "Indexing" : a.status === "ready" ? (a.duplicate ? "Already in library" : "Ready") : "Not indexed"}
                  </span>
                  <button type="button" aria-label={`Remove ${a.name} from this question`} onClick={() => setAttachments((xs) => xs.filter((x) => x.key !== a.key))} className="grid place-items-center size-6 rounded hover:bg-muted">
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1.5">
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
            {!hideControls && (
            <>
            <Menu
              label="Research mode"
              placement="bottom-start"
              trigger={
                <ControlButton>
                  <Gauge className="size-4" />
                  <span>{modeDef.label}</span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </ControlButton>
              }
              items={MODES.map((m) => ({
                label: (
                  <span className="flex items-center gap-2">
                    {m.label}
                    <span className="text-[11.5px] text-ink-faint">{m.eta}</span>
                  </span>
                ),
                description: m.description,
                icon: m.value === mode ? <Check /> : <span className="block size-4" />,
                onSelect: () => setMode(m.value),
              }))}
              className="w-[300px]"
            />

            <Popover
              label="Sources"
              placement="bottom-start"
              className="w-[300px] p-3"
              trigger={
                <ControlButton>
                  <Layers className="size-4" />
                  <span>{channels.length === 0 ? "No sources" : channels.length === 1 ? CHANNELS.find((c) => c.value === channels[0])!.label : `${channels.length} sources`}</span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </ControlButton>
              }
            >
              <p className="px-1 pb-2 text-[12px] font-medium text-ink-muted">Research across</p>
              <ul className="space-y-1">
                {CHANNELS.map((c) => {
                  const disabled = c.value === "project" && !projectId;
                  const on = channels.includes(c.value);
                  return (
                    <li key={c.value}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => toggleChannel(c.value)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-subtle disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <span className="grid place-items-center size-8 rounded-md border border-line bg-surface text-ink-muted">
                          <c.icon className="size-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13.5px] text-ink">{c.label}</span>
                          <span className="block text-[12px] text-ink-faint">{disabled ? "Choose a project first" : c.description}</span>
                        </span>
                        <span className={cn("grid place-items-center size-4.5 rounded-[5px] border transition-colors", on ? "bg-accent border-accent text-bg" : "border-line-strong")}>
                          {on && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Popover>

            {!lockProject && !hideControls && (
              <Menu
                label="Project"
                placement="bottom-start"
                trigger={
                  <ControlButton active={Boolean(project)}>
                    <FolderClosed className="size-4" />
                    <span className="max-w-[140px] truncate">{project ? project.name : "No project"}</span>
                    <ChevronDown className="size-3.5 opacity-60" />
                  </ControlButton>
                }
                items={[
                  {
                    label: "Research independently",
                    description: "Uses your global preferences",
                    icon: projectId === null ? <Check /> : <span className="block size-4" />,
                    onSelect: () => {
                      setProjectId(null);
                      if (!settings) setOwnChannels((cs) => cs.filter((c) => c !== "project"));
                    },
                  },
                  "separator",
                  { heading: "Research within a project" },
                  ...(projects ?? []).map((p) => ({
                    label: p.name,
                    description: `${p.documentIds.length} documents${p.instructions ? " · instructions" : ""}`,
                    icon: p.id === projectId ? <Check /> : <span className="block size-4" />,
                    onSelect: () => {
                      setProjectId(p.id);
                      if (!settings) setOwnChannels((cs) => (cs.includes("project") ? cs : [...cs, "project"]));
                    },
                  })),
                ]}
              />
            )}

            </>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (files.length) void attach(files);
              }}
            />
            <ControlButton onClick={() => fileRef.current?.click()} aria-label="Attach files">
              <Paperclip className="size-4" />
              <span className="hidden sm:inline">Attach</span>
            </ControlButton>
          </div>

          <button
            type="submit"
            disabled={submitting || !query.trim() || pending || overLimit}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl bg-ink text-bg font-medium transition-[background-color,opacity,transform] active:scale-[0.97]",
              "disabled:opacity-30 hover:bg-ink-2",
              hero ? "h-10 px-4 text-[14px]" : "h-9 px-3.5 text-[13.5px]",
            )}
          >
            {submitting ? <Spinner /> : <ArrowUp className="size-4" />}
            <span className="hidden xs:inline">Research</span>
          </button>
        </div>
      </div>

      <div className="min-h-6 mt-2 px-1 flex items-center justify-between gap-3">
        {nearLimit && (
          <p id="composer-count" aria-live="polite" className={cn("order-last shrink-0 text-[12px] tabular", overLimit ? "text-danger font-medium" : "text-ink-muted")}>
            {query.trim().length.toLocaleString()} / {MAX_QUERY.toLocaleString()}
          </p>
        )}
        {error ? (
          <p id="composer-error" role="alert" className="text-[12.5px] text-danger">
            {error}
          </p>
        ) : (
          <p className="text-[12.5px] text-ink-faint">
            {footerNote ?? (project ? `Using ${project.name} instructions and ${project.documentIds.length} documents.` : `${modeDef.label} · ${channels.map((c) => CHANNELS.find((x) => x.value === c)!.label).join(", ") || "no sources"}`)}
          </p>
        )}
      </div>
    </form>
  );
}

/** Same limit as the API (ResearchCreate.query max_length). */
export const MAX_QUERY = 2000;

interface Attachment {
  key: string;
  name: string;
  status: "uploading" | "processing" | "ready" | "failed";
  id?: string;
  duplicate?: boolean;
  message?: string;
}

function withProject(channels: SourceChannel[], projectId: string | null) {
  const base = channels.filter((c) => c !== "project");
  return projectId ? [...base, "project" as const] : base;
}

function ControlButton({ children, active, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors",
        active ? "bg-sage-soft text-sage-ink" : "text-ink-muted hover:text-ink hover:bg-subtle",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

