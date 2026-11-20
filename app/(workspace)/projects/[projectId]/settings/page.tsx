import type { Metadata } from "next";
import { ProjectSettingsRoute } from "@/components/projects/ProjectRoutes";

export const metadata: Metadata = { title: "Project settings" };

export default function Page() {
  return <ProjectSettingsRoute />;
}
