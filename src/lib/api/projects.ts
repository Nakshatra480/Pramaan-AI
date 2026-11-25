import type { ActivityItem, Project, ProjectInput, ProjectRole } from "@/types";
import { apiFetch } from "./client";
import { apiEvents } from "./events";
import type { ActivityDTO, ProjectDTO } from "./types";

export type ProjectScope = "all" | "mine" | "shared";

const toProject = (p: ProjectDTO): Project => ({ ...p });

const toActivity = (a: ActivityDTO): ActivityItem => ({
  id: a.id,
  projectId: a.projectId,
  kind: a.kind,
  actor: a.actor,
  title: a.title,
  detail: a.detail ?? undefined,
  href: a.href ?? undefined,
  createdAt: a.createdAt,
});

export const apiProjectService = {
  async list(scope: ProjectScope = "all"): Promise<Project[]> {
    const rows = (await apiFetch<ProjectDTO[]>("/projects", { query: { scope } })).map(toProject);
    return rows;
  },
  async get(id: string): Promise<Project | null> {
    try {
      return toProject(await apiFetch<ProjectDTO>(`/projects/${id}`));
    } catch (e) {
      if ((e as { status?: number }).status === 404 || (e as { status?: number }).status === 422) return null;
      throw e;
    }
  },
  async create(input: ProjectInput): Promise<Project> {
    const p = toProject(await apiFetch<ProjectDTO>("/projects", { method: "POST", body: { ...input } }));
    apiEvents.notify();
    return p;
  },
  async update(id: string, patch: Partial<Pick<Project, "name" | "description" | "icon" | "visibility">>) {
    await apiFetch(`/projects/${id}`, { method: "PATCH", body: patch });
    apiEvents.notify();
  },
  async updateInstructions(id: string, content: string) {
    await apiFetch(`/projects/${id}/instructions`, { method: "PUT", body: { content } });
    apiEvents.notify();
  },
  async remove(id: string) {
    await apiFetch(`/projects/${id}`, { method: "DELETE" });
    apiEvents.notify();
  },
  /** Owner only. The person must already have a Pramaan account (verified email). */
  async addMember(projectId: string, email: string, role: Exclude<ProjectRole, "owner">): Promise<Project> {
    const p = toProject(await apiFetch<ProjectDTO>(`/projects/${projectId}/members`, { method: "POST", body: { email, role } }));
    apiEvents.notify();
    return p;
  },
  async updateMember(projectId: string, userId: string, role: Exclude<ProjectRole, "owner">): Promise<Project> {
    const p = toProject(await apiFetch<ProjectDTO>(`/projects/${projectId}/members/${userId}`, { method: "PATCH", body: { role } }));
    apiEvents.notify();
    return p;
  },
  /** Owners remove members; members remove themselves to leave. */
  async removeMember(projectId: string, userId: string) {
    await apiFetch(`/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    apiEvents.notify();
  },
  async activity(projectId?: string, limit = 50): Promise<ActivityItem[]> {
    const rows = await apiFetch<ActivityDTO[]>(projectId ? `/projects/${projectId}/activity` : "/activity", { query: { limit } });
    return rows.map(toActivity);
  },
};
