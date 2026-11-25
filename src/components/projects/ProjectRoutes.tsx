import { AlertTriangle } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { useState } from "react";
import { LibraryBrowser } from "@/components/library/LibraryBrowser";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useResource } from "@/lib/hooks/use-resource";
import { services } from "@/lib/services";
import { isOwnProject } from "@/lib/utils/projects";
import type { Project } from "@/types";
import { ActivityFeed } from "./ActivityFeed";
import { ProjectPage } from "./ProjectContext";
import { ProjectInstructionEditor } from "./ProjectInstructionEditor";
import { ProjectWorkspace } from "./ProjectWorkspace";

export function ProjectResearchRoute() {
  return <ProjectPage render={(p) => <ProjectWorkspace project={p} />} />;
}

export function ProjectLibraryRoute() {
  return (
    <ProjectPage
      render={(p) => (
        <div>
          <p className="text-[14px] text-ink-muted mb-6 max-w-2xl">Documents here are only retrieved for research in {p.name}. Project retrieval is always scoped — other projects and users can&rsquo;t access them.</p>
          <LibraryBrowser projectId={p.id} />
        </div>
      )}
    />
  );
}

export function ProjectInstructionsRoute() {
  return (
    <ProjectPage
      render={(p) => (
        <div>
          <h2 className="font-display text-[30px] text-ink">Project instructions</h2>
          <p className="mt-1 mb-6 text-[14.5px] text-ink-muted">Tell Pramaan how to work within this project.</p>
          <ProjectInstructionEditor key={p.id} project={p} />
        </div>
      )}
    />
  );
}

export function ProjectActivityRoute() {
  return <ProjectPage render={(p) => <ProjectActivity projectId={p.id} />} />;
}

function ProjectActivity({ projectId }: { projectId: string }) {
  const { data, loading } = useResource(() => services.projects.activity(projectId), [projectId]);
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-[30px] text-ink mb-6">Activity</h2>
      {data && data.length === 0 ? <p className="text-[14px] text-ink-muted">No activity yet.</p> : <ActivityFeed items={data} loading={loading} />}
    </div>
  );
}

export function ProjectSettingsRoute() {
  return <ProjectPage render={(p) => <ProjectSettings key={`${p.id}:${p.updatedAt}`} project={p} />} />;
}

const MEMBER_ERRORS: Record<string, string> = {
  ACCOUNT_NOT_FOUND: "No Pramaan account uses that email yet. Ask them to sign up and verify their email, then add them.",
  ALREADY_MEMBER: "That person is already a member of this project.",
};

function ProjectSettings({ project }: { project: Project }) {
  const toast = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const { id: projectId, name: initialName, description: initialDesc } = project;
  const isOwner = isOwnProject(project);
  const canEdit = isOwner || project.role === "editor";
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDesc);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null);
  const [members, setMembers] = useState(project.members);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [adding, setAdding] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const dirty = name !== initialName || description !== initialDesc;

  const addMember = async () => {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setMemberError("Enter a valid email address.");
    setAdding(true);
    setMemberError(null);
    try {
      const updated = await services.projects.addMember(projectId, value, role);
      setMembers(updated.members);
      setEmail("");
      toast({ title: "Member added.", description: `They can now ${role === "editor" ? "edit and research in" : "view"} ${initialName}.` });
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setMemberError(MEMBER_ERRORS[code] ?? (e instanceof Error ? e.message : "Couldn't add that person."));
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (userId: string, next: "editor" | "viewer") => {
    try {
      setMembers((await services.projects.updateMember(projectId, userId, next)).members);
      toast({ title: "Role updated." });
    } catch (e) {
      toast({ title: "Couldn't change the role", description: e instanceof Error ? e.message : undefined, tone: "error" });
    }
  };

  const removeMember = async (userId: string) => {
    try {
      await services.projects.removeMember(projectId, userId);
      setMembers((ms) => ms.filter((m) => m.userId !== userId));
      toast({ title: "Member removed." });
    } catch (e) {
      toast({ title: "Couldn't remove this member", description: e instanceof Error ? e.message : undefined, tone: "error" });
    }
  };

  return (
    <div className="max-w-2xl space-y-12">
      <section className="space-y-5">
        <h2 className="font-display text-[30px] text-ink">Project settings</h2>
        <Field label="Name">{(p) => <Input {...p} value={name} readOnly={!canEdit} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Description">{(p) => <Textarea {...p} rows={3} value={description} readOnly={!canEdit} onChange={(e) => setDescription(e.target.value)} />}</Field>
        {canEdit && (
          <Button
            disabled={!dirty || !name.trim()}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await services.projects.update(projectId, { name: name.trim(), description: description.trim() });
                toast({ title: "Project updated." });
              } catch (e) {
                toast({ title: "Couldn't save", description: e instanceof Error ? e.message : undefined, tone: "error" });
              } finally {
                setSaving(false);
              }
            }}
          >
            Save changes
          </Button>
        )}
      </section>

      <section>
        <h3 className="text-[15px] font-semibold text-ink mb-1">Members</h3>
        <p className="mb-3 text-[13px] text-ink-muted">Editors can research, upload documents and edit instructions. Viewers can read the project&rsquo;s research and documents.</p>
        <ul className="rounded-xl border border-line divide-y divide-line bg-surface">
          {members.map((m) => {
            const self = m.userId === user?.id;
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar initials={m.initials} size={30} />
                <span className="flex-1 min-w-0 text-[14px] text-ink truncate">
                  {m.name}
                  {self && <span className="text-ink-muted"> (you)</span>}
                </span>
                {isOwner && m.role !== "owner" ? (
                  <>
                    <label htmlFor={`role-${m.userId}`} className="sr-only">
                      Role for {m.name}
                    </label>
                    <Select id={`role-${m.userId}`} value={m.role} onChange={(e) => changeRole(m.userId, e.target.value as "editor" | "viewer")} className="h-9 text-[13px]" containerClassName="w-32">
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </Select>
                    <Button variant="ghost" size="sm" className="text-danger" onClick={() => removeMember(m.userId)} aria-label={`Remove ${m.name}`}>
                      Remove
                    </Button>
                  </>
                ) : (
                  <Badge tone={m.role === "owner" ? "sage" : "outline"} className="capitalize">
                    {m.role}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
        {isOwner ? (
          <form
            noValidate
            className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-start"
            onSubmit={(e) => {
              e.preventDefault();
              void addMember();
            }}
          >
            <div className="flex-1">
              <Field label="Add a member by email" error={memberError ?? undefined} hint={memberError ? undefined : "They need a Pramaan account with a verified email."}>
                {(p) => <Input {...p} type="email" value={email} onChange={(e) => (setEmail(e.target.value), setMemberError(null))} placeholder="colleague@domain.com" autoComplete="off" />}
              </Field>
            </div>
            <div className="sm:pt-[26px] flex gap-2">
              <label htmlFor="new-member-role" className="sr-only">
                Role
              </label>
              <Select id="new-member-role" value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")} containerClassName="w-32">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </Select>
              <Button type="submit" loading={adding} disabled={!email.trim()}>
                Add
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" className="mt-4" onClick={() => setConfirm("leave")}>
            Leave project
          </Button>
        )}
      </section>

      {isOwner && (
        <section className="rounded-xl border border-danger/30 p-5">
          <h3 className="text-[15px] font-semibold text-ink">Delete project</h3>
          <p className="mt-1 text-[13.5px] text-ink-muted">Research sessions are kept as independent research. Project documents stay in your library.</p>
          <Button variant="secondary" className="mt-4 text-danger" onClick={() => setConfirm("delete")}>
            Delete project
          </Button>
        </section>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "leave" ? "Leave this project?" : "Delete this project?"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const action = confirm;
                router.replace("/projects"); // leave first: no refetch of a project we can no longer see (audit L-13)
                try {
                  if (action === "leave" && user) await services.projects.removeMember(projectId, user.id);
                  else await services.projects.remove(projectId);
                  toast({ title: action === "leave" ? "You left the project." : "Project deleted." });
                } catch (e) {
                  toast({ title: "Something went wrong", description: e instanceof Error ? e.message : undefined, tone: "error" });
                }
              }}
            >
              {confirm === "leave" ? "Leave project" : "Delete project"}
            </Button>
          </>
        }
      >
        <p className="flex gap-2 text-[13.5px] text-ink-muted">
          <AlertTriangle className="size-4 text-warn shrink-0 mt-0.5" />
          {confirm === "leave" ? `You'll lose access to ${initialName}'s research and documents until the owner adds you again.` : `Instructions and activity for ${initialName} will be permanently removed.`}
        </p>
      </Dialog>
    </div>
  );
}
