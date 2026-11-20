"use client";

import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { services } from "@/lib/services";
import type { LibraryDocument } from "@/types";

/**
 * Confirms before permanently deleting a library document (audit M-13).
 * `beforeDelete` runs first — e.g. navigate away from the document's page so it doesn't refetch a deleted record (L-13).
 */
export function DeleteDocumentDialog({ doc, onClose, beforeDelete }: { doc: LibraryDocument | null; onClose: () => void; beforeDelete?: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const used = doc?.projectIds?.length ?? 0;
  return (
    <Dialog
      open={doc !== null}
      onClose={() => !busy && onClose()}
      title="Delete this document?"
      description={
        doc
          ? `“${doc.filename}” and its extracted text will be permanently deleted${used ? ` and removed from ${used === 1 ? "1 project" : `${used} projects`}` : ""}. Existing reports keep the passages they cited.`
          : undefined
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              if (!doc) return;
              setBusy(true);
              beforeDelete?.();
              try {
                await services.library.remove(doc.id);
                toast({ title: "Document deleted." });
                onClose();
              } catch (e) {
                toast({ title: "Couldn't delete this document", description: e instanceof Error ? e.message : "Please try again.", tone: "error" });
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete
          </Button>
        </>
      }
    />
  );
}
