import type { Metadata } from "next";
import { ProjectResearchRoute } from "@/components/projects/ProjectRoutes";

export const metadata: Metadata = { title: "Project research" };

export default function Page() {
  return <ProjectResearchRoute />;
}
