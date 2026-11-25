import { services } from "@/lib/services";

const RESEARCH = /^\/research\/([^/?#]+)\/?(?:[?#].*)?$/;

/** Starts loading the data behind an in-app link the user is about to open (hover, focus or touch). */
export function prefetchRoute(href: string): void {
  const research = RESEARCH.exec(href)?.[1];
  if (research && research !== "new") services.research.prefetch(research);
}
