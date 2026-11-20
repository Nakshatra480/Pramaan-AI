"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowDownUp, FolderClosed, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MODES } from "@/components/research/research-options";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import { filterHistory, groupByDate, type HistoryFilter, type HistorySort } from "@/lib/utils/history";
import { formatDate } from "@/lib/utils/format";

export function HistoryView() {
  const { data: research, loading } = useResource(() => services.research.list(), []);
  const { data: projects } = useResource(() => services.projects.list(), []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [projectId, setProjectId] = useState("any");
  const [mode, setMode] = useState("any");
  const [sort, setSort] = useState<HistorySort>("newest");

  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const results = useMemo(
    () => filterHistory(research ?? [], { query, filter, projectId: projectId === "any" ? undefined : projectId, mode: mode === "any" ? undefined : (mode as never), sort }),
    [research, query, filter, projectId, mode, sort],
  );
  const groups = sort === "verified" ? [{ label: "Most verified", items: results }] : groupByDate(results);
  const hasFilters = query || filter !== "all" || projectId !== "any" || mode !== "any";

  return (
    <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-10 py-10 sm:py-14">
      <PageHeader title="History" description="Every research session, with its evidence intact." />

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-sm">
          <label htmlFor="hist-q" className="sr-only">
            Search history
          </label>
          <Input id="hist-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search research" leading={<Search className="size-4" />} />
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex lg:ml-auto">
          <label className="sr-only" htmlFor="hist-project">
            Project
          </label>
          <Select id="hist-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-9 text-[13px]" containerClassName="lg:w-44">
            <option value="any">All projects</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <label className="sr-only" htmlFor="hist-mode">
            Mode
          </label>
          <Select id="hist-mode" value={mode} onChange={(e) => setMode(e.target.value)} className="h-9 text-[13px]" containerClassName="lg:w-40">
            <option value="any">Any depth</option>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <label className="sr-only" htmlFor="hist-sort">
            Sort
          </label>
          <Select id="hist-sort" value={sort} onChange={(e) => setSort(e.target.value as HistorySort)} className="h-9 text-[13px]" containerClassName="lg:w-40">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="verified">Most verified</option>
          </Select>
        </div>
      </div>

      <Tabs
        className="mt-6"
        label="Filter research"
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: "All" },
          { value: "project", label: "In projects" },
          { value: "independent", label: "Independent" },
          { value: "attention", label: "Needs attention" },
        ]}
      />

      <div className="mt-2">
        {loading ? (
          <div className="space-y-3 pt-6" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : !research?.length ? (
          <EmptyState title="Your research history will appear here." description="Every question you research is saved with its sources and verified claims." action={<ButtonLink href="/research/new">Start researching</ButtonLink>} />
        ) : results.length === 0 ? (
          <EmptyState
            compact
            title="No research matches"
            description="Try a different search or clear the filters."
            action={
              hasFilters ? (
                <button type="button" className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink" onClick={() => (setQuery(""), setFilter("all"), setProjectId("any"), setMode("any"))}>
                  <X className="size-3.5" /> Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-8 pt-6">
            <div className="hidden md:grid grid-cols-[minmax(0,1fr)_160px_90px_110px_110px] gap-4 px-3 text-[11.5px] uppercase tracking-[0.12em] text-ink-faint">
              <span>Research</span>
              <span>Project</span>
              <span className="text-right">Sources</span>
              <span className="text-right">Verified</span>
              <span className="text-right inline-flex items-center justify-end gap-1">
                Date <ArrowDownUp className="size-3" />
              </span>
            </div>
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h2 className="px-3 mb-1 text-[12.5px] font-medium text-ink-muted">{g.label}</h2>
                <ul className="divide-y divide-line border-y border-line">
                  {g.items.map((r, i) => {
                    const p = r.projectId ? projectById.get(r.projectId) : undefined;
                    const failed = r.status !== "complete" && r.status !== "running";
                    return (
                      <motion.li key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                        <Link href={`/research/${r.id}`} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_90px_110px_110px] gap-1 md:gap-4 items-center px-3 py-3.5 hover:bg-subtle/60 transition-colors">
                          <span className="min-w-0 flex items-center gap-2">
                            <span className={cn("size-1.5 rounded-full shrink-0", r.status === "running" ? "bg-accent animate-pulse-soft" : failed ? "bg-warn" : "bg-sage-deep")} aria-hidden />
                            <span className="text-[14.5px] text-ink truncate">{r.title}</span>
                            {failed && (
                              <span className="inline-flex items-center gap-1 text-[11.5px] text-warn shrink-0">
                                <AlertTriangle className="size-3" />
                                {r.status === "timeout" ? "Timed out" : r.status === "no_sources" ? "No sources" : "Failed"}
                              </span>
                            )}
                          </span>
                          <span className="text-[12.5px] text-ink-muted truncate inline-flex items-center gap-1.5 pl-3.5 md:pl-0">
                            {p ? (
                              <>
                                <FolderClosed className="size-3.5 text-ink-faint" />
                                {p.name}
                              </>
                            ) : (
                              <span className="text-ink-faint">Independent</span>
                            )}
                          </span>
                          <span className="hidden md:block text-right text-[13px] text-ink-2 tabular">{r.metrics.sources}</span>
                          <span className="hidden md:block text-right text-[13px] text-sage-ink tabular">{r.status === "complete" ? r.metrics.verifiedClaims : "—"}</span>
                          <span className="hidden md:block text-right text-[12.5px] text-ink-faint tabular">{formatDate(r.createdAt, { day: "numeric", month: "short" })}</span>
                        </Link>
                      </motion.li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
