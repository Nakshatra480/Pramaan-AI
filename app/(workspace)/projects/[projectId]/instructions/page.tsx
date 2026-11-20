import type { Metadata } from "next";
import { ProjectInstructionsRoute } from "@/components/projects/ProjectRoutes";

export const metadata: Metadata = { title: "Project instructions" };

export default function Page() {
  return <ProjectInstructionsRoute />;
}
