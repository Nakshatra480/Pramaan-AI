import type { Metadata } from "next";
import { ProjectActivityRoute } from "@/components/projects/ProjectRoutes";

export const metadata: Metadata = { title: "Project activity" };

export default function Page() {
  return <ProjectActivityRoute />;
}
