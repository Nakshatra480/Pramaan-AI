import { motion } from "framer-motion";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspace } from "@/components/layout/WorkspaceContext";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { isOwnProject } from "@/lib/utils/projects";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { ProjectCard, ProjectCardSkeleton } from "./ProjectCard";

type Scope = "all" | "mine" | "shared";

export function ProjectsIndex() {
  const { setCreateProjectOpen } = useWorkspace();
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const { data: projects, loading } = useResource(() => services.projects.list("all"), []);

  const counts = useMemo(
    () => ({
      all: projects?.length ?? 0,
      mine: projects?.filter((p) => isOwnProject(p)).length ?? 0,
      shared: projects?.filter((p) => !isOwnProject(p)).length ?? 0,
    }),
    [projects],
  );

  const visible = (projects ?? [])
    .filter((p) => (scope === "mine" ? isOwnProject(p) : scope === "shared" ? !isOwnProject(p) : true))
    .filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-10 py-10 sm:py-14">
      <PageHeader
        title="Projects"
        description="Research spaces for ongoing work."
        actions={
          <>
            <div className="w-full sm:w-64">
              <label htmlFor="proj-search" className="sr-only">
                Search projects
              </label>
              <Input id="proj-search" placeholder="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} leading={<Search className="size-4" />} />
            </div>
            <Button leading={<Plus className="size-4" />} onClick={() => setCreateProjectOpen(true)}>
              New project
            </Button>
          </>
        }
      />
      <Tabs
        label="Project ownership"
        className="mt-8"
        value={scope}
        onChange={setScope}
        items={[
          { value: "all", label: "All", count: counts.all },
          { value: "mine", label: "Created by you", count: counts.mine },
          { value: "shared", label: "Shared with you", count: counts.shared },
        ]}
      />
      <div className="mt-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : !projects?.length ? (
          <EmptyState
            title="No projects yet"
            description="Create a workspace for research you want to keep building."
            action={
              <Button leading={<Plus className="size-4" />} onClick={() => setCreateProjectOpen(true)}>
                Create project
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState compact title="No matching projects" description={scope === "shared" && !query ? "Projects others share with you will appear here." : "Try a different search."} />
        ) : (
          <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((p, i) => (
              <motion.div key={p.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4 }}>
                <ProjectCard project={p} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
