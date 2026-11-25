/** Activity kinds shown under the bell, per Settings → Notifications. */
export function notificationKinds(n: { researchComplete: boolean; documentIndexed: boolean }): string[] {
  return [n.researchComplete && "research_completed", n.documentIndexed && "document_added"].filter(Boolean) as string[];
}
