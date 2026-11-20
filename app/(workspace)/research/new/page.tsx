import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata: Metadata = { title: "New research" };

export default async function NewResearchPage({ searchParams }: PageProps<"/research/new">) {
  const { q, project } = await searchParams;
  return <Dashboard initialQuery={typeof q === "string" ? q : undefined} initialProject={typeof project === "string" ? project : undefined} />;
}
