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
