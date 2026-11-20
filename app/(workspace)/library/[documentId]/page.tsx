import type { Metadata } from "next";
import { DocumentViewer } from "@/components/library/DocumentViewer";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: PageProps<"/library/[documentId]">) {
  const { documentId } = await params;
  return <DocumentViewer documentId={documentId} />;
}
