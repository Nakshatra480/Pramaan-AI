import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, FileUp, ListChecks } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { useState } from "react";
import { VerificationMark } from "@/components/animations/VerificationMark";
import { useWorkspace } from "@/components/layout/WorkspaceContext";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { track } from "@/lib/firebase/analytics";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import type { Project, ProjectIcon as IconName } from "@/types";
import { PROJECT_ICONS } from "./ProjectIcon";

/** Create project → "Project created" next steps (PRD §33). Opened from anywhere via workspace context. */
export function CreateProjectModal() {
  const { createProjectOpen, setCreateProjectOpen } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<IconName>("sparkle");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<Project | null>(null);

  const close = () => {
    setCreateProjectOpen(false);
    setTimeout(() => {
      setName("");
      setDescription("");
      setIcon("sparkle");
      setCreated(null);
      setError(undefined);
    }, 250);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give your project a name.");
      return;
    }
    setLoading(true);
    let p;
    try {
      p = await services.projects.create({ name, description, icon });
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Couldn't create the project.");
      return;
    }
    void track("project_created");
    setLoading(false);
    setCreated(p);
    toast({ title: "Project created." });
  };

  const go = (href: string) => {
    close();
    router.push(href);
  };

  return (
    <Dialog open={createProjectOpen} onClose={close} title={created ? "Project created" : "New project"} hideHeader={Boolean(created)} description="A persistent workspace for research you want to keep building.">
      <AnimatePresence mode="wait" initial={false}>
        {!created ? (
          <motion.form key="form" onSubmit={submit} exit={{ opacity: 0, y: -8 }} className="space-y-5">
            <Field label="Project name" error={error}>
              {(p) => <Input {...p} data-autofocus value={name} onChange={(e) => (setName(e.target.value), setError(undefined))} placeholder="e.g. Climate Research" maxLength={60} />}
            </Field>
            <Field label="Description" hint="Optional — helps you and collaborators recognise the project.">
              {(p) => <Textarea {...p} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this research for?" maxLength={200} />}
            </Field>
            <fieldset>
              <legend className="text-[13px] font-medium text-ink-2 mb-2">Icon</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {(Object.keys(PROJECT_ICONS) as IconName[]).map((k) => {
                  const Icon = PROJECT_ICONS[k];
                  const on = icon === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={k}
                      onClick={() => setIcon(k)}
                      className={cn("grid place-items-center size-10 rounded-lg border transition-colors", on ? "border-accent bg-sage-soft text-sage-ink" : "border-line text-ink-muted hover:border-line-strong hover:text-ink")}
                    >
                      <Icon className="size-[18px]" strokeWidth={1.6} />
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={loading}>
                Create project
              </Button>
            </div>
          </motion.form>
        ) : (
          <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 sm:p-8">
            <VerificationMark size={40} />
            <h2 className="mt-5 font-display text-[32px] leading-tight text-ink">{created.name} is ready.</h2>
            <p className="mt-2 text-[14.5px] text-ink-muted">Add context to make Pramaan work better for this project. You can always do this later.</p>
            <div className="mt-6 space-y-2">
              {[
                { icon: ListChecks, label: "Add instructions", body: "Tell Pramaan how to research here", href: `/projects/${created.id}/instructions` },
                { icon: FileUp, label: "Add files", body: "Upload papers, notes and documents", href: `/projects/${created.id}/library` },
                { icon: ArrowRight, label: "Start researching", body: "Ask your first question", href: `/projects/${created.id}` },
              ].map((a, i) => (
                <motion.button
                  key={a.label}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.06 }}
                  onClick={() => go(a.href)}
                  className="w-full flex items-center gap-4 rounded-xl border border-line p-4 text-left hover:border-line-strong hover:bg-subtle/60 transition-colors"
                >
                  <span className="grid place-items-center size-9 rounded-lg bg-sage-soft text-sage-ink">
                    <a.icon className="size-4" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14px] font-medium text-ink">{a.label}</span>
                    <span className="block text-[12.5px] text-ink-muted">{a.body}</span>
                  </span>
                  <ArrowRight className="size-4 text-ink-faint" />
                </motion.button>
              ))}
            </div>
            <button type="button" onClick={() => go(`/projects/${created.id}`)} className="mt-5 text-[13px] text-ink-muted hover:text-ink">
              Skip for now
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
