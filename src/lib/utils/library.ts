import type { LibraryDocument, LibraryFilter } from "@/types";

export function matchesLibraryFilter(d: LibraryDocument, filter: LibraryFilter) {
  switch (filter) {
    case "all":
      return true;
    case "pdf":
      return d.kind === "pdf";
    case "documents":
      return d.kind === "docx" || d.kind === "txt" || d.kind === "markdown" || d.kind === "note";
    case "papers":
      return d.kind === "paper";
    case "websites":
      return d.kind === "website";
  }
}

/**
 * "Research with this": a new research built from the document first, saved in its project — the project the user
 * is browsing (`projectId`), or the document's only project.
 */
export function researchWithDocumentHref(doc: { id: string; title: string; projectIds: string[] }, projectId?: string | null): string {
  const params = new URLSearchParams({ q: `Summarise the key findings of “${doc.title}”`, doc: doc.id });
  const project = projectId ?? (doc.projectIds.length === 1 ? doc.projectIds[0] : null);
  if (project) params.set("project", project);
  return `/research/new?${params.toString()}`;
}
