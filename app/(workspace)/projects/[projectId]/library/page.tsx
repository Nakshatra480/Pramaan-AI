import type { Metadata } from "next";
import { ProjectLibraryRoute } from "@/components/projects/ProjectRoutes";

export const metadata: Metadata = { title: "Project library" };

export default function Page() {
  return <ProjectLibraryRoute />;
}
