import { CURRENT_USER_ID } from "@/data/projects";
import type { Project } from "@/types";

/** Ownership as seen by the current user. The API supplies `role`; demo data falls back to the demo owner id. */
export function isOwnProject(p: Project): boolean {
  return p.role ? p.role === "owner" : p.ownerId === CURRENT_USER_ID;
}
