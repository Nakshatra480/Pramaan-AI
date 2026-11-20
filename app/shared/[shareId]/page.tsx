import type { Metadata } from "next";
import { SharedReport } from "@/components/research/SharedReport";

export const metadata: Metadata = { title: "Shared research", robots: { index: false } };

export default async function SharedPage({ params }: PageProps<"/shared/[shareId]">) {
  const { shareId } = await params;
  return <SharedReport shareId={shareId} />;
}
