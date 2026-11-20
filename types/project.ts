/** Project types. Mirrors `projects`, `project_members`, `project_instructions` (PRD §32–§36). */

export type ProjectRole = "owner" | "editor" | "viewer";
export type ProjectIcon = "sparkle" | "leaf" | "flask" | "chart" | "book" | "globe" | "cpu" | "compass";

export interface ProjectMember {
  userId: string;
  name: string;
  role: ProjectRole;
  initials: string;
}

export interface ProjectInstruction {
  projectId: string;
  content: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: ProjectIcon;
  ownerId: string;
  ownerName: string;
  members: ProjectMember[];
  createdAt: string;
  updatedAt: string;
  researchCount: number;
  documentIds: string[];
  instructions: string;
  visibility: "private" | "link";
  /** The current user's role — provided by the API. */
  role?: ProjectRole;
}

export type ActivityKind =
  | "research_completed"
  | "document_added"
  | "instructions_updated"
  | "member_joined"
  | "project_created"
  | "research_shared";

export interface ActivityItem {
  id: string;
  projectId: string | null;
  kind: ActivityKind;
  actor: string;
  title: string;
  detail?: string;
  href?: string;
  createdAt: string;
}

export interface ProjectInput {
  name: string;
  description: string;
  icon: ProjectIcon;
}
