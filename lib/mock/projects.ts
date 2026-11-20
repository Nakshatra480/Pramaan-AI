import { CURRENT_USER_ID } from "@/data/projects";
import type { ActivityItem, Project, ProjectInput, ProjectRole } from "@/types";
import { db, latency, uid } from "./db";

export type ProjectScope = "all" | "mine" | "shared";

export const projectService = {
  async list(scope: ProjectScope = "all"): Promise<Project[]> {
    await latency(240);
    return db
      .read()
      .projects.filter((p) => (scope === "mine" ? p.ownerId === CURRENT_USER_ID : scope === "shared" ? p.ownerId !== CURRENT_USER_ID : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async get(id: string): Promise<Project | null> {
    await latency(160);
    return db.read().projects.find((p) => p.id === id) ?? null;
  },

  async create(input: ProjectInput): Promise<Project> {
    await latency(420);
    const now = new Date().toISOString();
    const project: Project = {
      id: uid("p"),
      name: input.name.trim(),
      description: input.description.trim(),
      icon: input.icon,
      ownerId: CURRENT_USER_ID,
      ownerName: "You",
      members: [{ userId: CURRENT_USER_ID, name: "You", role: "owner", initials: "AM" }],
      createdAt: now,
      updatedAt: now,
      researchCount: 0,
      documentIds: [],
      instructions: "",
      visibility: "private",
    };
    db.write((d) => {
      d.projects.unshift(project);
      d.activity.unshift({ id: uid("a"), projectId: project.id, kind: "project_created", actor: "You", title: `Created ${project.name}`, createdAt: now });
    });
    return project;
  },

  async update(id: string, patch: Partial<Pick<Project, "name" | "description" | "icon" | "visibility">>) {
    await latency(260);
    db.write((d) => {
      const p = d.projects.find((x) => x.id === id);
      if (p) Object.assign(p, patch, { updatedAt: new Date().toISOString() });
    });
  },

  async addMember(projectId: string, email: string, role: Exclude<ProjectRole, "owner">): Promise<Project> {
    await latency(300);
    const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const userId = `u-${email.toLowerCase()}`;
    let out: Project | undefined;
    db.write((d) => {
      const p = d.projects.find((x) => x.id === projectId);
      if (!p) return;
      if (p.members.some((m) => m.userId === userId)) throw Object.assign(new Error("That person is already a member of this project."), { code: "ALREADY_MEMBER" });
      p.members.push({ userId, name, role, initials: name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() });
      out = p;
    });
    if (!out) throw new Error("Project not found.");
    return out;
  },

  async updateMember(projectId: string, userId: string, role: Exclude<ProjectRole, "owner">): Promise<Project> {
    await latency(200);
    let out: Project | undefined;
    db.write((d) => {
      const p = d.projects.find((x) => x.id === projectId);
      const m = p?.members.find((x) => x.userId === userId);
      if (m && m.role !== "owner") m.role = role;
      out = p;
    });
    if (!out) throw new Error("Project not found.");
    return out;
  },

  async removeMember(projectId: string, userId: string) {
    await latency(200);
    db.write((d) => {
      const p = d.projects.find((x) => x.id === projectId);
      if (p) p.members = p.members.filter((m) => m.userId !== userId || m.role === "owner");
    });
  },

  async updateInstructions(id: string, content: string) {
    await latency(520);
    const now = new Date().toISOString();
    db.write((d) => {
      const p = d.projects.find((x) => x.id === id);
      if (!p) return;
      p.instructions = content;
      p.updatedAt = now;
      d.activity.unshift({
        id: uid("a"),
        projectId: id,
        kind: "instructions_updated",
        actor: "You",
        title: "Updated project instructions",
        detail: content.split("\n").find(Boolean)?.slice(0, 80),
        createdAt: now,
      });
    });
  },

  async remove(id: string) {
    await latency(300);
    db.write((d) => {
      d.projects = d.projects.filter((p) => p.id !== id);
      d.research.forEach((r) => {
        if (r.projectId === id) r.projectId = null;
      });
    });
  },

  async activity(projectId?: string, limit = 50): Promise<ActivityItem[]> {
    await latency(220);
    return db
      .read()
      .activity.filter((a) => (projectId ? a.projectId === projectId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  },
};
