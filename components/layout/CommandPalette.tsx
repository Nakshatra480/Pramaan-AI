import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpen, CornerDownLeft, FileText, FolderClosed, FolderPlus, History, Moon, Plus, Quote, Search, Settings, Upload } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { Portal } from "@/components/ui/Portal";
import { useFocusTrap, useLockScroll } from "@/lib/hooks/use-focus-trap";
import { spring } from "@/lib/motion";
import { services, type SearchResult, type SearchResultKind } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "./WorkspaceContext";

interface Entry {
  id: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  group: string;
  run: () => void;
}

const KIND_ICON: Record<SearchResultKind, ReactNode> = {
  research: <FileText className="size-4" />,
  project: <FolderClosed className="size-4" />,
  document: <BookOpen className="size-4" />,
  source: <Quote className="size-4" />,
  setting: <Settings className="size-4" />,
  action: <ArrowRight className="size-4" />,
};

const KIND_GROUP: Record<SearchResultKind, string> = {
  research: "Research",
  project: "Projects",
  document: "Documents",
  source: "Sources",
  setting: "Settings",
  action: "Actions",
};

export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useWorkspace();
  return (
    <Portal>
      <AnimatePresence>{commandOpen && <PaletteInner onClose={() => setCommandOpen(false)} />}</AnimatePresence>
    </Portal>
  );
}

function PaletteInner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { prefs, update } = usePreferences();
  const { setCreateProjectOpen } = useWorkspace();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<{ q: string; results: SearchResult[] } | null>(null);
  const [failed, setFailed] = useState(false);

  // Server-side search (audit H-06): debounced; responses for an older query are discarded.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      services
        .search(q, controller.signal)
        .then((results) => {
          setFailed(false);
          setFound({ q, results });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setFailed(true);
          setFound({ q, results: [] });
        });
    }, 160);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);
  const searching = !!query.trim() && found?.q !== query.trim();
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  useLockScroll(true);

  const go = (href: string) => () => {
    onClose();
    router.push(href);
  };

  const entries = useMemo<Entry[]>(() => {
    if (!query.trim()) {
      const actions: Entry[] = [
        { id: "new", title: "New research", icon: <Plus className="size-4" />, group: "Actions", run: go("/research/new") },
        { id: "research-q", title: "Research a question…", subtitle: "Type a question, then press Enter", icon: <Search className="size-4" />, group: "Actions", run: go("/research/new") },
        { id: "proj", title: "Create project", icon: <FolderPlus className="size-4" />, group: "Actions", run: () => { onClose(); router.push("/projects"); setCreateProjectOpen(true); } },
        { id: "upload", title: "Upload to library", icon: <Upload className="size-4" />, group: "Actions", run: go("/library?upload=1") },
        { id: "theme", title: prefs.theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance", icon: <Moon className="size-4" />, group: "Actions", run: () => { update({ theme: prefs.theme === "dark" ? "light" : "dark" }); onClose(); } },
        { id: "projects", title: "Projects", icon: <FolderClosed className="size-4" />, group: "Go to", run: go("/projects") },
        { id: "library", title: "Library", icon: <BookOpen className="size-4" />, group: "Go to", run: go("/library") },
        { id: "history", title: "History", icon: <History className="size-4" />, group: "Go to", run: go("/history") },
        { id: "settings", title: "Settings", icon: <Settings className="size-4" />, group: "Go to", run: go("/settings") },
      ];
      return actions;
    }
    const results: SearchResult[] = (found?.results ?? []).slice(0, 14);
    const mapped: Entry[] = results.map((r) => ({ id: `${r.kind}-${r.id}`, title: r.title, subtitle: r.subtitle, icon: KIND_ICON[r.kind], group: KIND_GROUP[r.kind], run: go(r.href) }));
    mapped.push({
      id: "ask",
      title: `Research “${query.trim()}”`,
      subtitle: "Start a new research session",
      icon: <ArrowRight className="size-4" />,
      group: "Ask Pramaan",
      run: go(`/research/new?q=${encodeURIComponent(query.trim())}`),
    });
    return mapped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, prefs.theme, found]);

  useEffect(() => {
    // Reset highlight when results change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(entries.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      entries[active]?.run();
    }
  };

  const groups = entries.reduce<Record<string, { e: Entry; i: number }[]>>((acc, e, i) => {
    (acc[e.group] ??= []).push({ e, i });
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[var(--z-command)] flex items-start justify-center px-3 pt-[10vh]">
      <motion.div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={onClose} aria-hidden />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Search Pramaan"
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
        transition={spring.gentle}
        className="relative w-full max-w-[620px] rounded-2xl border border-line bg-surface shadow-lg overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search className="size-[18px] text-ink-faint" />
          <input
            data-autofocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search research, projects, documents, sources…"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-ink-faint"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={entries[active] ? `cmd-${entries[active].id}` : undefined}
            aria-autocomplete="list"
          />
        </div>
        <div ref={listRef} id="command-list" role="listbox" className="max-h-[min(420px,60vh)] overflow-y-auto thin-scrollbar p-2">
          {query.trim() && (searching || failed || entries.length <= 1) && (
            <p className="px-3 pt-3 text-[12.5px] text-ink-muted" role="status">
              {searching ? "Searching…" : failed ? "Search is unavailable right now." : "No matching research, projects or documents."}
            </p>
          )}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} role="group" aria-label={group} className="mb-1">
              <p className="px-2.5 pt-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">{group}</p>
              {items.map(({ e, i }) => (
                <div
                  key={e.id}
                  id={`cmd-${e.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={e.run}
                  className={cn("relative flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer", i === active ? "text-ink" : "text-ink-2")}
                >
                  {i === active && <motion.span layoutId="cmd-active" transition={spring.snappy} className="absolute inset-0 rounded-lg bg-subtle" />}
                  <span className="relative grid place-items-center size-8 rounded-md border border-line bg-raised text-ink-muted shrink-0">{e.icon}</span>
                  <span className="relative flex-1 min-w-0">
                    <span className="block text-[13.5px] truncate">{e.title}</span>
                    {e.subtitle && <span className="block text-[12px] text-ink-faint truncate">{e.subtitle}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="relative size-3.5 text-ink-faint" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
