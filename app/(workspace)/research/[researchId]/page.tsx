import type { Metadata } from "next";
import { ResearchView } from "@/components/research/ResearchView";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchPage({ params, searchParams }: PageProps<"/research/[researchId]">) {
  const { researchId } = await params;
  const { source } = await searchParams;
  return <ResearchView key={researchId} researchId={researchId} initialSourceId={typeof source === "string" ? source : null} />;
}
